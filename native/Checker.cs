namespace Kole;

sealed class Info(string type = "", string kind = "value")
{
    public string Type = type, Kind = kind, DeclaredType = "", ReadType = "", Name = "";
    public bool Writable;
    public Number? Constant;
    public Info? Binding;
    public Class? Class;
    public Node? Method;
    public Enumeration? Enum;
    public string[] Parameters = [];
    public Info Copy() => (Info)MemberwiseClone();
}
sealed class TypeScope(TypeScope? parent, Class owner, bool instance)
{
    public TypeScope? Parent = parent; public Class Owner = owner; public bool Instance = instance;
    public Dictionary<string, Info> Locals = []; public Dictionary<Info, string> Facts = parent is null ? [] : new(parent.Facts);
    public TypeScope(TypeScope parent) : this(parent, parent.Owner, parent.Instance) { }
    public Info? Find(string name) => Locals.GetValueOrDefault(name) ?? Parent?.Find(name);
}
sealed class Checker(Runtime runtime)
{
    readonly Runtime r = runtime;
    static Info Value(string type) => new(type);
    string Type(string name, Class owner, Node n)
    {
        r.ValidateType(name, owner, n);
        return r.TypeKey(name, owner);
    }
    static string Require(Info info, Node n)
    {
        if (info.Kind != "value" || info.Type == "void")
            Runtime.Fail(n, "Expected a value, not a class, method, enum namespace, or void result");
        return info.Type;
    }
    public bool Assignable(string expected, string actual)
    {
        if (expected.EndsWith('?'))
            return actual == "null" || Assignable(expected[..^1], actual.EndsWith('?') ? actual[..^1] : actual);
        if (actual == "null" || actual.EndsWith('?'))
            return expected == actual;
        return expected == actual || Numbers.Widens(expected, actual) || Runtime.Subtype(r.Classes.GetValueOrDefault(actual), expected);
    }
    void Expect(string expected, Info actual, Node node)
    {
        string type = Require(actual, node);
        if (!Assignable(expected, type) && !Numbers.Fits(expected.TrimEnd('?'), actual.Constant))
            Runtime.Fail(node, $"Expected {expected}, received {type}");
    }
    static Info Declare(TypeScope s, string name, string type, Node node, bool readOnly = false)
    {
        if (s.Locals.ContainsKey(name))
            Runtime.Fail(node, $"Variable '{name}' is already declared in this scope");
        var binding = new Info(type) { Writable = !readOnly };
        s.Locals[name] = binding;
        return binding;
    }
    Info Field(Class cls, Node field, TypeScope scope, Node node)
    {
        r.Access(field, cls, scope.Owner, node);
        return new(Type(field.Type, field.Owner ?? cls, field))
        {
            Writable = !field.Const && !field.Lifecycle && field.Relationship != "belongsTo"
        };
    }
    Info Member(Info obj, string name, TypeScope scope, Node node)
    {
        if (obj.Kind == "value" && (obj.Type == "null" || obj.Type.EndsWith('?')))
            Runtime.Fail(node, $"Cannot access '{name}' on nullable {obj.Type}; check a local value against null first");
        if (obj.Kind == "value" && name == "length" && (obj.Type == "string" || obj.Type.EndsWith("[]") || obj.Type.StartsWith("List<")))
            return Value("int");
        if (obj.Kind == "value" && Builtins.Signature(obj.Type, name) is { } signature)
            return new(signature.Returns, "builtin")
            {
                Name = name,
                Parameters = signature.Params
            };
        if (obj.Kind == "enum")
        {
            if (!obj.Enum!.Values.ContainsKey(name))
                Runtime.Fail(node, $"Unknown enum value '{name}'");
            return Value(obj.Enum.Owner + "." + obj.Enum.Declaration.Name);
        }
        var cls = obj.Kind is "class" or "super" ? obj.Class : obj.Kind == "value" ? r.Classes.GetValueOrDefault(obj.Type) : null;
        if (cls is null)
            throw new Fault($"Cannot access '{name}' on {obj.Type}", node.Token);
        if (obj.Kind == "value" && cls.Fields.TryGetValue(name, out var f))
            return Field(cls, f, scope, node);
        if (cls.Enums.TryGetValue(name, out var e))
        {
            r.Access(e.Declaration, cls, scope.Owner, node);
            return new("", "enum")
            {
                Class = cls,
                Enum = e
            };
        }
        if (!cls.Methods.TryGetValue(name, out var m) || m.Constructor)
            throw new Fault($"Unknown member '{name}' on {cls.Name}", node.Token);
        r.Access(m, cls, scope.Owner, node);
        if (!m.Static && obj.Kind == "class")
            Runtime.Fail(node, $"Method '{name}' needs an instance");
        if (obj.Kind == "super" && m.Abstract)
            Runtime.Fail(node, "Cannot invoke an abstract parent method");
        return new("", "method")
        {
            Class = m.Owner ?? cls,
            Method = m
        };
    }
    Info Name(string name, TypeScope scope, Node node)
    {
        if (name == "me")
        {
            if (!scope.Instance)
                Runtime.Fail(node, "me is unavailable in a static method");
            return Value(scope.Owner.Name);
        }
        if (name == "super")
        {
            if (!scope.Instance || scope.Owner.Parent is null)
                Runtime.Fail(node, "super requires a subclass instance");
            return new("", "super")
            {
                Class = scope.Owner.Parent
            };
        }
        if (scope.Find(name) is { } local)
        {
            var info = local.Copy();
            info.Type = scope.Facts.GetValueOrDefault(local, local.Type);
            info.DeclaredType = local.Type;
            info.Binding = local;
            return info;
        }
        if (scope.Instance && scope.Owner.Fields.TryGetValue(name, out var field))
            return Field(scope.Owner, field, scope, node);
        if (scope.Owner.Enums.TryGetValue(name, out var e))
        {
            r.Access(e.Declaration, scope.Owner, scope.Owner, node);
            return new("", "enum")
            {
                Class = scope.Owner,
                Enum = e
            };
        }
        if (scope.Owner.Lifecycle is { } lifecycle)
        {
            var en = scope.Owner.Enums[lifecycle.Type];
            if (en.Values.ContainsKey(name))
                return Value(en.Owner + "." + en.Declaration.Name);
        }
        if (scope.Owner.Methods.ContainsKey(name))
            return Member(scope.Instance ? Value(scope.Owner.Name) : new("", "class")
            {
                Class = scope.Owner
            }, name, scope, node);
        string? className = scope.Owner.Aliases is { } aliases ? aliases.GetValueOrDefault(name) : name;
        if (className is not null && r.Classes.TryGetValue(className, out var cls))
            return new("", "class")
            {
                Class = cls
            };
        if (name == "print")
            return new("", "print");
        if (Numbers.Primitives.Contains(name))
            return new(name, "conversion");
        throw new Fault($"Unknown name '{name}'", node.Token);
    }
    Info Target(Node node, TypeScope scope)
    {
        var target = Expression(node, scope);
        if (!target.Writable)
            Runtime.Fail(node, "Cannot assign to a const binding, loop counter, lifecycle field, belongsTo reference, or non-writable expression");
        target.ReadType = target.Type;
        if (target.DeclaredType != "")
            target.Type = target.DeclaredType;
        return target;
    }
    void Arguments(Node method, Class cls, List<Node> args, TypeScope scope, Node node)
    {
        if (args.Count != method.Params.Count)
            Runtime.Fail(node, $"{method.Name} expects {method.Params.Count} arguments, got {args.Count}");
        for (int i = 0; i < args.Count; i++)
        {
            string type = Type(method.Params[i].Type, cls, method.Params[i]);
            Expect(type, Expression(args[i], scope, type), args[i]);
        }
    }
    Info Binary(string op, Info left, Info right, Node node)
    {
        string a = Require(left, node), b = Require(right, node);
        if (op is "==" or "!=")
        {
            if (a == "null" || b == "null")
                return Value("bool");
            if (!Assignable(a, b) && !Assignable(b, a))
                Runtime.Fail(node, $"Cannot compare {a} with {b}");
            return Value("bool");
        }
        if (op is "&&" or "||")
        {
            Expect("bool", left, node);
            Expect("bool", right, node);
            return Value("bool");
        }
        if (op == "+" && (a == "string" || b == "string"))
            return Value("string");
        if (a == "char" && b == "char" && op is "<" or ">" or "<=" or ">=")
            return Value("bool");
        if (!Numbers.Is(a) || !Numbers.Is(b))
            Runtime.Fail(node, $"Operator '{op}' requires numeric operands, received {a} and {b}");
        return Value(op is "<" or ">" or "<=" or ">=" ? "bool" : Numbers.Promote(a, b));
    }
    public Info Expression(Node node, TypeScope scope, string? expected = null)
    {
        switch (node.Kind)
        {
            case "literal":
                return node.Value is Number n ? new(n.Type)
                {
                    Constant = n
                } : Value(r.TypeOf(node.Value));
            case "name":
                return Name(node.Name, scope, node);
            case "member":
                return Member(Expression(node.Object!, scope), node.Name, scope, node);
            case "index":
                string obj = Require(Expression(node.Object!, scope), node.Object!);
                if (obj.EndsWith('?') || obj == "null")
                    Runtime.Fail(node, "Cannot index a nullable value; check a local value against null first");
                Expect("int", Expression(node.Index!, scope), node.Index!);
                if (obj == "string")
                    return Value("char");
                if (obj.EndsWith("[]"))
                    return new(obj[..^2])
                    {
                        Writable = true
                    };
                if (obj.StartsWith("List<"))
                    return new(obj[5..^1])
                    {
                        Writable = true
                    };
                throw new Fault("Indexing requires an array, List, or string", node.Token);
            case "unary":
                var operand = Expression((Node)node.Value!, scope);
                if (node.Op == "!")
                {
                    Expect("bool", operand, node);
                    return Value("bool");
                }
                if (!Numbers.Is(Require(operand, node)))
                    Runtime.Fail(node, $"Operator '{node.Op}' requires a number");
                return Value(Numbers.Promote(operand.Type));
            case "binary":
                var left = Expression(node.Left!, scope);
                if (node.Op is "&&" or "||")
                {
                    var branch = new TypeScope(scope);
                    Refine(node.Left!, node.Op == "&&", branch);
                    var right = Expression(node.Right!, branch);
                    scope.Facts = Common([scope, branch]);
                    return Binary(node.Op, left, right, node);
                }
                return Binary(node.Op, left, Expression(node.Right!, scope), node);
            case "assign":
                var target = Target(node.Left!, scope);
                var rhs = Expression(node.Right!, scope, node.Op == "=" ? target.Type : null);
                var result = node.Op == "=" ? rhs : Binary(node.Op[..1], Value(target.ReadType), rhs, node);
                if (!(node.Op != "=" && Numbers.Is(target.ReadType) && Numbers.Is(result.Type)))
                    Expect(target.Type, result, node);
                if (target.Binding is { } b)
                {
                    scope.Facts.Remove(b);
                    if (target.Type.EndsWith('?') && rhs.Type != "null" && !rhs.Type.EndsWith('?'))
                        scope.Facts[b] = target.Type[..^1];
                }
                return Value(target.Type);
            case "update":
                var update = Target((Node)node.Value!, scope);
                if (!Numbers.Is(update.ReadType))
                    Runtime.Fail(node, "Increment/decrement requires a number");
                return Value(update.ReadType);
            case "switch":
                var selector = Expression((Node)node.Value!, scope);
                Require(selector, node);
                var labels = new HashSet<string>();
                var switchScopes = new List<TypeScope>();
                var results = new List<Info>();
                foreach (var arm in node.Items)
                {
                    if (arm.Left is { } labelNode)
                    {
                        var label = Expression(labelNode, scope);
                        bool enumeration = labelNode.Kind == "member" && Expression(labelNode.Object!, scope).Kind == "enum";
                        if (labelNode.Kind != "literal" && !enumeration)
                            Runtime.Fail(labelNode, "Switch cases require literals or enum values");
                        Binary("==", selector, label, labelNode);
                        string key = enumeration ? label.Type + ":" + labelNode.Name : (Numbers.Is(label.Type) ? "number" : label.Type) + ":" + r.Format(labelNode.Value);
                        if (!labels.Add(key))
                            Runtime.Fail(labelNode, "Duplicate switch case");
                    }
                    var armScope = new TypeScope(scope);
                    var armResult = Expression(arm.Right!, armScope, expected);
                    Require(armResult, arm.Right!);
                    switchScopes.Add(armScope);
                    results.Add(armResult);
                }
                string switchType = expected ?? results[0].Type;
                if (expected is null)
                foreach (var armResult in results.Skip(1))
                {
                    if (Assignable(switchType, armResult.Type))
                        continue;
                    if (Assignable(armResult.Type, switchType))
                        switchType = armResult.Type;
                    else if (switchType == "null")
                        switchType = armResult.Type.EndsWith('?') ? armResult.Type : armResult.Type + "?";
                    else if (armResult.Type == "null")
                        switchType = switchType.EndsWith('?') ? switchType : switchType + "?";
                    else
                        Runtime.Fail(node, "Switch arms need a common type; declare a armResult type");
                }
                for (int i = 0; i < results.Count; i++)
                    Expect(switchType, results[i], node.Items[i].Right!);
                node.Type = switchType;
                scope.Facts = Common(switchScopes);
                return Value(switchType);
            case "new":
                if (!r.Classes.TryGetValue(node.Name, out var cls))
                    throw new Fault($"Unknown class '{node.Name}'", node.Token);
                Type(node.Name, scope.Owner, node);
                if (cls.Abstract)
                    Runtime.Fail(node, $"Cannot construct abstract class '{node.Name}'");
                if (cls.IsInterface)
                    Runtime.Fail(node, $"Cannot construct interface '{node.Name}'");
                if (cls.Methods.TryGetValue(cls.Name, out var ctor))
                {
                    r.Access(ctor, cls, scope.Owner, node);
                    Arguments(ctor, cls, node.Args, scope, node);
                }
                else if (node.Args.Count > 0)
                    Runtime.Fail(node, $"{cls.Name} has no constructor accepting arguments");
                return Value(cls.Name);
            case "newArray":
                string element = Type(node.Type, scope.Owner, node);
                Expect("int", Expression((Node)node.Value!, scope), (Node)node.Value!);
                r.Default(element, node);
                return Value(element + "[]");
            case "newList":
                string listType = Type(node.Name, scope.Owner, node);
                if (node.Args.Count > 0)
                    Runtime.Fail(node, "List<A>() takes no constructor arguments");
                return Value(listType);
            case "array":
                string? want = expected?.TrimEnd('?');
                string? arrayElement = want?.EndsWith("[]") == true ? want[..^2] : null;
                var infos = node.Items.Select(i => Expression(i, scope, arrayElement)).ToList();
                if (arrayElement is null)
                {
                    if (infos.Count == 0)
                        Runtime.Fail(node, "Empty array literals require a declared element type");
                    arrayElement = Require(infos[0], node.Items[0]);
                    foreach (var info in infos.Skip(1))
                    {
                        string next = Require(info, node);
                        if (arrayElement == "null" && next != "null")
                            arrayElement = next.EndsWith('?') ? next : next + "?";
                        else if (next == "null" && arrayElement != "null")
                            arrayElement = arrayElement.EndsWith('?') ? arrayElement : arrayElement + "?";
                        else if (Assignable(next, arrayElement))
                            arrayElement = next;
                        else if (!Assignable(arrayElement, next))
                            Runtime.Fail(node, "Array elements need a common type or a declared element type");
                    }
                    if (arrayElement == "null")
                        Runtime.Fail(node, "An all-null array requires a declared element type");
                }
                for (int i = 0; i < infos.Count; i++)
                    Expect(arrayElement, infos[i], node.Items[i]);
                node.ResolvedElementType = arrayElement;
                return Value(arrayElement + "[]");
            case "call":
                var callee = Expression(node.Callee!, scope);
                if (callee.Kind == "class")
                    return Expression(new Node("new", node.Token) { Name = callee.Class!.Name, Args = node.Args }, scope);
                if (callee.Kind == "print")
                {
                    foreach (var arg in node.Args)
                        Require(Expression(arg, scope), arg);
                    return Value("void");
                }
                if (callee.Kind == "conversion")
                {
                    if (node.Args.Count != 1)
                        Runtime.Fail(node, $"{callee.Type} conversion expects one argument");
                    string actual = Require(Expression(node.Args[0], scope), node.Args[0]);
                    bool valid = callee.Type == "string" || Numbers.Is(callee.Type) && (Numbers.Is(actual) || actual == "char") || callee.Type == "char" && (actual is "char" or "string" || Numbers.Is(actual) && actual != "float") || callee.Type == "bool" && actual == "bool";
                    if (!valid)
                        Runtime.Fail(node, $"Cannot convert {actual} to {callee.Type}");
                    return Value(callee.Type);
                }
                if (callee.Kind == "builtin")
                {
                    if (node.Args.Count != callee.Parameters.Length)
                        Runtime.Fail(node, $"{callee.Name} expects {callee.Parameters.Length} arguments");
                    for (int i = 0; i < node.Args.Count; i++)
                        Expect(callee.Parameters[i], Expression(node.Args[i], scope, callee.Parameters[i]), node.Args[i]);
                    return Value(callee.Type);
                }
                if (callee.Kind != "method")
                    Runtime.Fail(node, "Value is not callable");
                Arguments(callee.Method!, callee.Class!, node.Args, scope, node);
                return Value(callee.Method!.Type == "void" ? "void" : Type(callee.Method.Type, callee.Class!, callee.Method));
            default:
                throw new Fault($"Unknown expression '{node.Kind}'", node.Token);
        }
    }
    static Dictionary<Info, string> Common(List<TypeScope> scopes) => scopes.Count == 0 ? [] : scopes[0].Facts.Where(pair => scopes.All(s => s.Facts.GetValueOrDefault(pair.Key) == pair.Value)).ToDictionary();
    static HashSet<string> Assigned(Node node)
    {
        var names = new HashSet<string>();
        void Walk(Node n)
        {
            var target = n.Kind == "assign" ? n.Left : n.Kind == "update" ? n.Value as Node : null;
            if (target?.Kind == "name")
                names.Add(target.Name);
            foreach (var child in n.Children())
                Walk(child);
        }
        Walk(node);
        return names;
    }
    static void Kill(Node node, TypeScope scope)
    {
        foreach (var name in Assigned(node))
            if (scope.Find(name) is { } b)
                scope.Facts.Remove(b);
    }
    static void Refine(Node condition, bool truth, TypeScope scope, HashSet<string>? assigned = null)
    {
        assigned ??= Assigned(condition);
        if (condition.Kind == "unary" && condition.Op == "!")
        {
            Refine((Node)condition.Value!, !truth, scope, assigned);
            return;
        }
        if (condition.Kind != "binary")
            return;
        if (condition.Op == "&&" && truth || condition.Op == "||" && !truth)
        {
            Refine(condition.Left!, truth, scope, assigned);
            Refine(condition.Right!, truth, scope, assigned);
            return;
        }
        if (condition.Op is not ("==" or "!=") || truth != (condition.Op == "!="))
            return;
        string? name = condition.Left?.Kind == "name" && condition.Right?.Kind == "literal" && condition.Right.Value is null ? condition.Left.Name : condition.Right?.Kind == "name" && condition.Left?.Kind == "literal" && condition.Left.Value is null ? condition.Right.Name : null;
        if (name is not null && scope.Find(name) is { } b && b.Type.EndsWith('?') && !assigned.Contains(name))
            scope.Facts[b] = b.Type[..^1];
    }
    HashSet<string> Statement(Node node, TypeScope scope, string returnType)
    {
        switch (node.Kind)
        {
            case "block":
                var local = new TypeScope(scope);
                var paths = new HashSet<string> { "normal" };
                foreach (var child in node.Statements)
                {
                    var next = Statement(child, local, returnType);
                    if (paths.Remove("normal"))
                        paths.UnionWith(next);
                }
                scope.Facts = local.Facts;
                return paths;
            case "declare":
                string type = Type(node.Type, scope.Owner, node);
                Info? initial = node.Value is Node value ? Expression(value, scope, type) : null;
                if (initial is not null)
                    Expect(type, initial, (Node)node.Value!);
                var binding = Declare(scope, node.Name, type, node, node.Const);
                if (type.EndsWith('?') && initial is not null && initial.Type != "null" && !initial.Type.EndsWith('?'))
                    scope.Facts[binding] = type[..^1];
                break;
            case "expression":
                Expression((Node)node.Value!, scope);
                break;
            case "require":
                Expect("bool", Expression(node.Condition!, scope), node.Condition!);
                Refine(node.Condition!, true, scope);
                break;
            case "return":
                if (returnType == "void")
                {
                    if (node.Value is not null)
                        Runtime.Fail(node, "A void method cannot return a value");
                }
                else if (node.Value is null)
                    Runtime.Fail(node, $"Expected return value of type {returnType}");
                else
                    Expect(returnType, Expression((Node)node.Value, scope, returnType), (Node)node.Value);
                return ["return"];
            case "throw":
                Expect("Error", Expression((Node)node.Value!, scope), node);
                return ["throw"];
            case "break":
            case "continue":
                return [node.Kind];
            case "superCall":
                Runtime.Fail(node, "super(...) must be the first constructor statement of a subclass");
                break;
            case "using":
                string resourceType = Type(node.Type, scope.Owner, node);
                if (!Assignable("Closeable", resourceType))
                    Runtime.Fail(node, "using requires a non-null Closeable");
                Expect(resourceType, Expression((Node)node.Value!, scope, resourceType), node);
                var resourceScope = new TypeScope(scope);
                Declare(resourceScope, node.Name, resourceType, node, true);
                var outcome = Statement(node.Body!, resourceScope, returnType);
                scope.Facts = resourceScope.Facts;
                return outcome;
            case "try":
                Kill(node, scope);
                var branch = new TypeScope(scope);
                var outcomes = Statement(node.Body!, branch, returnType);
                var branches = new List<TypeScope>();
                if (outcomes.Contains("normal"))
                    branches.Add(branch);
                var caught = new List<string>();
                foreach (var handler in node.Catches)
                {
                    string catchType = Type(handler.Type, scope.Owner, handler);
                    if (!Assignable("Error", catchType) || catchType.EndsWith('?'))
                        Runtime.Fail(handler, "catch requires a non-null Error subtype");
                    if (caught.Any(previous => Assignable(previous, catchType)))
                        Runtime.Fail(handler, "Unreachable catch: an earlier handler catches this type");
                    caught.Add(catchType);
                    var catchScope = new TypeScope(scope);
                    Declare(catchScope, handler.Name, catchType, handler);
                    var flow = Statement(handler.Body!, catchScope, returnType);
                    outcomes.UnionWith(flow);
                    if (flow.Contains("normal"))
                        branches.Add(catchScope);
                }
                scope.Facts = Common(branches);
                if (node.Finalizer is not null)
                {
                    Kill(node, scope);
                    var final = Statement(node.Finalizer, scope, returnType);
                    if (!final.Contains("normal"))
                        return final;
                    outcomes.UnionWith(final.Where(x => x != "normal"));
                }
                return outcomes;
            case "if":
                Expect("bool", Expression(node.Condition!, scope), node.Condition!);
                var yesScope = new TypeScope(scope);
                var noScope = new TypeScope(scope);
                Refine(node.Condition!, true, yesScope);
                Refine(node.Condition!, false, noScope);
                var yes = Statement(node.Yes!, yesScope, returnType);
                var no = node.No is null ? new HashSet<string> { "normal" } : Statement(node.No, noScope, returnType);
                if (node.Condition!.Kind == "literal" && node.Condition.Value is bool condition)
                {
                    scope.Facts = condition ? yesScope.Facts : noScope.Facts;
                    return condition ? yes : no;
                }
                scope.Facts = Common([.. yes.Contains("normal") ? new[] { yesScope } : [], .. no.Contains("normal") ? new[] { noScope } : []]);
                yes.UnionWith(no);
                return yes;
            case "foreach":
                string iterableType = Require(Expression((Node)node.Value!, scope), node);
                if ((iterableType.StartsWith("Map<") || iterableType.StartsWith("Set<")) && !iterableType.EndsWith('?'))
                {
                    node.Value = new Node("call", node.Token) { Callee = new Node("member", node.Token) { Object = (Node)node.Value!, Name = iterableType.StartsWith("Map<") ? "keys" : "toList" } };
                    iterableType = Require(Expression((Node)node.Value, scope), node);
                }
                string? elementType = iterableType == "string" ? "char" : iterableType.EndsWith("[]") ? iterableType[..^2] : iterableType.StartsWith("List<") && iterableType.EndsWith('>') ? iterableType[5..^1] : null;
                if (elementType is null)
                    Runtime.Fail(node, "Collection loop requires a non-null array, List, Set, Map, or string");
                node.Type = elementType!;
                Kill(node.Body!, scope);
                var eachScope = new TypeScope(scope);
                Declare(eachScope, node.Name, node.Type, node, true);
                var eachPaths = Statement(node.Body!, eachScope, returnType);
                return eachPaths.Contains("return") ? ["normal", "return"] : ["normal"];
            case "for":
                Expect("int", Expression(node.Start!, scope), node.Start!);
                Expect("int", Expression(node.End!, scope), node.End!);
                Kill(node.Body!, scope);
                var forScope = new TypeScope(scope);
                Declare(forScope, node.Name, "int", node, true);
                var forPaths = Statement(node.Body!, forScope, returnType);
                return forPaths.Contains("return") ? ["normal", "return"] : ["normal"];
            case "while":
                Kill(node, scope);
                Expect("bool", Expression(node.Condition!, scope), node.Condition!);
                var whileScope = new TypeScope(scope);
                Refine(node.Condition!, true, whileScope);
                var whilePaths = Statement(node.Body!, whileScope, returnType);
                Kill(node.Body!, scope);
                var result = new HashSet<string>();
                if (whilePaths.Contains("return"))
                    result.Add("return");
                if (!(node.Condition!.Kind == "literal" && node.Condition.Value is true) || whilePaths.Contains("break"))
                    result.Add("normal");
                return result;
            default:
                Runtime.Fail(node, $"Unknown statement '{node.Kind}'");
                break;
        }
        return ["normal"];
    }
    public void Check()
    {
        foreach (var cls in r.Classes.Values)
        {
            if (cls.IsInterface)
                continue;
            if (cls.Parent is { } parent && !cls.OwnMethods.ContainsKey(cls.Name) && parent.OwnMethods.TryGetValue(parent.Name, out var implicitParent))
            {
                r.Access(implicitParent, parent, cls, cls.Declaration);
                if (implicitParent.Params.Count > 0)
                    Runtime.Fail(cls.Declaration, "Subclass needs a constructor calling super with parent arguments");
            }
            var fieldScope = new TypeScope(null, cls, true);
            foreach (var field in cls.OwnFields.Values)
                if (field.Init is not null)
                {
                    string type = Type(field.Type, cls, field);
                    Expect(type, Expression(field.Init, fieldScope, type), field.Init);
                }
            foreach (var method in cls.OwnMethods.Values)
            {
                if (method.Body is null)
                    continue;
                var scope = new TypeScope(null, cls, !method.Static);
                foreach (var p in method.Params)
                    Declare(scope, p.Name, Type(p.Type, cls, p), p);
                string type = method.Type == "void" ? "void" : Type(method.Type, cls, method);
                var body = method.Body;
                if (method.Constructor && cls.Parent is { } baseClass)
                {
                    var first = body.Statements.FirstOrDefault();
                    var args = first?.Kind == "superCall" ? first.Args : [];
                    var before = new TypeScope(null, cls, false) { Locals = scope.Locals };
                    if (baseClass.OwnMethods.TryGetValue(baseClass.Name, out var ctor))
                    {
                        r.Access(ctor, baseClass, cls, method);
                        Arguments(ctor, baseClass, args, before, method);
                    }
                    else if (args.Count > 0)
                        Runtime.Fail(method, "Parent has no constructor accepting arguments");
                    if (first?.Kind == "superCall")
                        body = new("block", body.Token)
                        {
                            Statements = body.Statements.Skip(1).ToList()
                        };
                }
                var paths = Statement(body, scope, type);
                if (type != "void" && paths.Contains("normal"))
                    Runtime.Fail(method, $"Method '{method.Name}' may finish without returning {type}");
            }
        }
        foreach (var cls in r.Classes.Values)
            if (!cls.IsInterface)
                new Initialization(cls).Check();
    }
}
