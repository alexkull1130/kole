using System.Numerics;

namespace Kole;

sealed class Runtime
{
    public Dictionary<string, Class> Classes = [];
    public static readonly object Unset = new();
    int steps, depth;
    public int MaxSteps = 1_000_000;
    public Action<string> Print = Console.WriteLine;
    public Runtime(List<Node> program)
    {
        program = Types.Specialize(Standard.With(program));
        foreach (var node in program)
        {
            if (Classes.ContainsKey(node.Name) || Numbers.Primitives.Contains(node.Name) || node.Name is "boolean" or "String" or "double" or "List" or "void" or "print")
                Fail(node, $"Duplicate or reserved class '{node.Name}'");
            Classes[node.Name] = new(node);
        }
        foreach (var cls in Classes.Values)
        {
            var names = new HashSet<string>();
            foreach (var m in cls.Declaration.Members)
            {
                if (!names.Add(m.Name))
                    Fail(m, $"Duplicate member '{m.Name}'; overloading is not supported yet");
                if (m.Name == cls.Name && !m.Constructor)
                    Fail(m, "Only a constructor may use the class name as a member name");
                m.Owner = cls;
                if (m.Kind == "field")
                {
                    cls.Fields[m.Name] = m;
                    if (m.Lifecycle)
                    {
                        if (cls.Lifecycle is not null)
                            Fail(m, "Only one lifecycle field is supported per class");
                        if (m.Access != "private" || m.Init is null)
                            Fail(m, "A lifecycle field must be private and initialized");
                        cls.Lifecycle = m;
                    }
                }
                else if (m.Kind == "enum")
                {
                    if (Classes.ContainsKey(m.Name) || Numbers.Primitives.Contains(m.Name) || m.Name is "List" or "void")
                        Fail(m, $"Enum name '{m.Name}' conflicts with a type name");
                    if (m.Values.Distinct().Count() != m.Values.Count)
                        Fail(m, "Duplicate enum state");
                    cls.Enums[m.Name] = new(cls.Name, m);
                }
                else
                {
                    cls.Methods[m.Name] = m;
                    if (m.Params.Select(x => x.Name).Distinct().Count() != m.Params.Count)
                        Fail(m, "Duplicate parameter");
                }
            }
        }
        Link();
        foreach (var cls in Classes.Values)
        {
            if (cls.Lifecycle is { } life && !cls.Enums.ContainsKey(life.Type))
                Fail(life, "Lifecycle type must be an enum declared in this class");
            foreach (var method in cls.Methods.Values)
                if (method.From != "")
                {
                    if (cls.Lifecycle is null)
                        Fail(method, "Lifecycle method requires a state field");
                    var values = cls.Enums[cls.Lifecycle!.Type].Values;
                    if (!values.ContainsKey(method.From) || method.To != "" && !values.ContainsKey(method.To))
                        Fail(method, "Unknown lifecycle state");
                }
            foreach (var arg in cls.Declaration.TypeArguments)
                ValidateType(arg, null, cls.Declaration);
            foreach (var field in cls.Fields.Values)
                ValidateType(field.Type, field.Owner, field);
            foreach (var method in cls.Methods.Values)
            {
                if (method.Type != "void")
                    ValidateType(method.Type, method.Owner, method);
                foreach (var p in method.Params)
                    ValidateType(p.Type, method.Owner, p);
            }
        }
        foreach (var cls in Classes.Values)
        {
            if (cls.Declaration.Interfaces.Distinct().Count() != cls.Declaration.Interfaces.Count)
                Fail(cls.Declaration, "Duplicate implemented interface");
            foreach (var name in cls.Interfaces)
            {
                if (!Classes.TryGetValue(name, out var contract) || !contract.IsInterface)
                    Fail(cls.Declaration, $"'{name}' is not an interface");
                foreach (var requirement in contract!.Methods.Values)
                {
                    var m = cls.Methods.GetValueOrDefault(requirement.Name);
                    if (m is null && cls.Abstract)
                        continue;
                    if (m is null)
                        Fail(cls.Declaration, $"{cls.Name} must implement {name}.{requirement.Name}");
                    if (m!.Static || m.Access != "public" || m.Constructor || m.From != "" || m.Type != requirement.Type || m.Params.Count != requirement.Params.Count || m.Params.Where((p, i) => p.Type != requirement.Params[i].Type || cls.Enums.ContainsKey(p.Type)).Any())
                        Fail(m, $"Signature of '{m.Name}' must match interface {name} exactly, without lifecycle restrictions");
                }
            }
        }
        foreach (var cls in Classes.Values)
            foreach (var field in cls.OwnFields.Values)
            {
                if (field.Relationship == "")
                    continue;
                var related = Classes.GetValueOrDefault(field.Type.TrimEnd('?'));
                if (related is null || related.IsInterface)
                    Fail(field, "Relationships require a concrete class type, optionally nullable");
                if (field.Relationship == "belongsTo")
                {
                    if (!field.Type.EndsWith('?') || field.Init is not null)
                        Fail(field, "belongsTo must be nullable with no initializer");
                    if (!related!.Fields.Values.Any(f => f.Relationship == "owns" && f.Type.TrimEnd('?') == cls.Name))
                        Fail(field, "belongsTo needs a matching owns field in the owner class");
                }
                else
                {
                    var inverse = related!.Fields.Values.Where(f => f.Relationship == "belongsTo" && f.Type.TrimEnd('?') == cls.Name).ToList();
                    if (inverse.Count > 1)
                        Fail(field, "Ambiguous belongsTo relationship");
                    field.Inverse = inverse.FirstOrDefault()?.Name;
                }
            }
    }
    void Link()
    {
        var visiting = new HashSet<Class>();
        var done = new HashSet<Class>();
        void Visit(Class cls)
        {
            if (done.Contains(cls))
                return;
            if (!visiting.Add(cls))
                Fail(cls.Declaration, "Inheritance cycle");
            cls.OwnFields = new(cls.Fields);
            cls.OwnMethods = new(cls.Methods);
            if (cls.Declaration.Parent != "")
            {
                if (!Classes.TryGetValue(cls.Declaration.Parent, out var parent) || parent.IsInterface)
                    Fail(cls.Declaration, "extends requires a class");
                Visit(parent!);
                cls.Parent = parent;
                foreach (var (name, f) in parent!.Fields)
                    if (cls.Fields.ContainsKey(name) || cls.Methods.ContainsKey(name) || cls.Enums.ContainsKey(name))
                        Fail(cls.Declaration, $"Inherited field '{name}' cannot be shadowed");
                foreach (var (name, e) in parent.Enums)
                {
                    if (cls.Fields.ContainsKey(name) || cls.Methods.ContainsKey(name) || cls.Enums.ContainsKey(name))
                        Fail(cls.Declaration, $"Inherited enum '{name}' cannot be shadowed");
                    cls.Enums[name] = e;
                }
                cls.Fields = new(parent.Fields);
                foreach (var (name, f) in cls.OwnFields)
                    cls.Fields[name] = f;
                foreach (var (name, m) in parent.Methods)
                {
                    if (m.Constructor)
                        continue;
                    if (cls.Fields.ContainsKey(name) || cls.Enums.ContainsKey(name))
                        Fail(cls.Declaration, $"Inherited method '{name}' conflicts with a member");
                    if (cls.Methods.TryGetValue(name, out var replace))
                    {
                        if (!replace.Override)
                            Fail(replace, $"Method '{name}' replaces a parent method; add override");
                        if (m.Access == "private" || m.Static || replace.Static || replace.Constructor)
                            Fail(replace, "Only accessible instance methods can be overridden");
                        if (replace.Access != m.Access || replace.Type != m.Type || replace.Params.Count != m.Params.Count || replace.Params.Where((p, i) => p.Type != m.Params[i].Type).Any() || replace.From != m.From || replace.To != m.To)
                            Fail(replace, $"Override '{name}' must match its parent signature and lifecycle clauses exactly");
                    }
                    else
                        cls.Methods[name] = m;
                }
                if (cls.Lifecycle is not null && parent.Lifecycle is not null)
                    Fail(cls.Lifecycle, "A subclass cannot redeclare inherited lifecycle state");
                cls.Lifecycle ??= parent.Lifecycle;
                cls.Interfaces.UnionWith(parent.Interfaces);
            }
            foreach (var m in cls.OwnMethods.Values)
                if (m.Override && !(cls.Parent?.Methods.ContainsKey(m.Name) ?? false))
                    Fail(m, $"override '{m.Name}' has no parent method");
            if (!cls.Abstract && !cls.IsInterface)
                foreach (var m in cls.Methods.Values)
                    if (m.Abstract)
                        Fail(cls.Declaration, $"Concrete class '{cls.Name}' must implement abstract method '{m.Name}'");
            visiting.Remove(cls);
            done.Add(cls);
        }
        foreach (var cls in Classes.Values)
            Visit(cls);
    }
    public static bool Subtype(Class? cls, string name)
    {
        for (var c = cls; c is not null; c = c.Parent)
            if (c.Name == name || c.Interfaces.Contains(name))
                return true;
        return false;
    }
    [System.Diagnostics.CodeAnalysis.DoesNotReturn] public static void Fail(Node? node, string message) => throw new Fault(message, node?.Token);
    void Tick(Node node)
    {
        if (++steps > MaxSteps)
            throw new Fault("Execution step limit exceeded", node.Token) { Fatal = true };
    }
    void Enter(Node node)
    {
        if (++depth > 256)
        {
            depth--;
            throw new Fault("Call depth limit exceeded", node.Token) { Fatal = true };
        }
    }
    public void ValidateType(string type, Class? owner, Node node)
    {
        if (type.EndsWith('?'))
        {
            ValidateType(type[..^1], owner, node);
            return;
        }
        if (type.EndsWith("[]"))
        {
            ValidateType(type[..^2], owner, node);
            return;
        }
        if (type.StartsWith("List<") && type.EndsWith('>'))
        {
            ValidateType(type[5..^1], owner, node);
            return;
        }
        var generic = Types.Generic(type);
        if (generic is { } g)
            foreach (var arg in g.Args)
                ValidateType(arg, owner, node);
        if (Classes.ContainsKey(type) && !type.StartsWith('#') && owner?.Aliases is { } aliases && !aliases.Values.Any(a => a == type || generic is { } gn && (a == gn.Base || Types.Generic(a)?.Base == gn.Base)))
            Fail(node, $"Type '{type}' must be imported in this file");
        int dot = type.LastIndexOf('.');
        if (dot > 0 && Classes.GetValueOrDefault(type[..dot])?.Enums.ContainsKey(type[(dot + 1)..]) == true)
            return;
        if (!Numbers.Primitives.Contains(type) && !Classes.ContainsKey(type) && owner?.Enums.ContainsKey(type) != true)
            Fail(node, $"Unknown type '{type}'");
    }
    public string TypeKey(string type, Class? owner)
    {
        if (type.EndsWith('?'))
            return TypeKey(type[..^1], owner) + "?";
        if (type.EndsWith("[]"))
            return TypeKey(type[..^2], owner) + "[]";
        if (type.StartsWith("List<") && type.EndsWith('>'))
            return $"List<{TypeKey(type[5..^1], owner)}>";
        return owner?.Enums.TryGetValue(type, out var e) == true ? e.Owner + "." + type : type;
    }
    public object? CheckType(string type, object? value, Class? owner, Node node)
    {
        ValidateType(type, owner, node);
        if (type.EndsWith('?'))
            return value is null ? null : CheckType(type[..^1], value, owner, node);
        bool valid;
        if (type.EndsWith("[]"))
            valid = value is Collection a && a.Kind == "array" && a.Type == TypeKey(type, owner);
        else if (type.StartsWith("List<"))
            valid = value is Collection l && l.Kind == "list" && l.Type == TypeKey(type, owner);
        else if (Numbers.Is(type))
        {
            if (value is Number n && (Numbers.Widens(type, n.Type) || Numbers.Fits(type, n)))
                return Numbers.Convert(type, n, node.Token);
            valid = false;
        }
        else if (type == "bool")
            valid = value is bool;
        else if (type == "string")
            valid = value is string;
        else if (type == "char")
            valid = value is Character;
        else if (owner?.Enums.ContainsKey(type) == true || !Classes.ContainsKey(type) && type.Contains('.'))
            valid = value is EnumValue e && e.Owner + "." + e.Type == TypeKey(type, owner);
        else
            valid = value is Instance obj && Subtype(obj.Class, type);
        if (!valid)
            Fail(node, $"Expected {type}, received {Format(value)}");
        return value;
    }
    public bool Bool(object? value, Node node) => value is bool b ? b : throw new Fault("Condition must be bool", node.Token);
    public int Index(object? value, Node node) => (int)((Number)CheckType("int", value, null, node)!).Integer;
    public void Bounds(int length, int index, Node node)
    {
        if (index < 0 || index >= length)
            Fail(node, $"Index {index} out of bounds for length {length}");
    }
    public void Size(int size, Node node)
    {
        if (size < 0 || size > 100000)
            Fail(node, "Collection length must be between 0 and 100000");
    }
    public Collection Collection(string kind, string element, List<object?> items, Class? owner, Node node)
    {
        ValidateType(element, owner, node);
        Size(items.Count, node);
        element = TypeKey(element, owner);
        return new(kind, element, items.Select(x => CheckType(element, x, owner, node)).ToList(), owner);
    }
    public object? Default(string type, Node node)
    {
        if (type.EndsWith('?'))
            return null;
        if (Numbers.Is(type))
            return Numbers.Make(type, BigInteger.Zero, node.Token);
        return type switch
        {
            "bool" => false,
            "string" => "",
            "char" => Numbers.Character("\0", node.Token),
            _ => throw new Fault($"No default value for {type}; use an array literal or nullable elements", node.Token)
        };
    }
    public string TypeOf(object? value) => value switch { null => "null", string => "string", bool => "bool", Number n => n.Type, Character => "char", Collection c => c.Type, Instance i => i.Class.Name, EnumValue e => e.Owner + "." + e.Type, _ => "void" };
    public string Format(object? value, HashSet<object>? seen = null)
    {
        seen ??= [];
        if (ReferenceEquals(value, Unset))
            return "<uninitialized>";
        if (value is Collection c)
        {
            if (!seen.Add(c))
                return "[...]";
            string text = "[" + string.Join(", ", c.Items.Select(x => Format(x, seen))) + "]";
            seen.Remove(c);
            return text;
        }
        return value switch
        {
            null => "null",
            bool b => b ? "true" : "false",
            string s => s,
            Number n => Numbers.Text(n),
            Character ch => ch.Text,
            EnumValue e => e.Type + "." + e.Name,
            Instance i => $"<{i.Class.Name}>",
            Class klass => $"<{klass.Name}>",
            _ => "<value>"
        };
    }
    public Binding Declare(Scope scope, string name, string type, object? value, Node node, bool readOnly = false)
    {
        if (scope.Locals.ContainsKey(name))
            Fail(node, $"Variable '{name}' is already declared in this scope");
        ValidateType(type, scope.Owner, node);
        if (!ReferenceEquals(value, Unset))
            value = CheckType(type, value, scope.Owner, node);
        var b = new Binding(type, value, scope.Owner, readOnly);
        scope.Locals[name] = b;
        return b;
    }
    public object? Read(Binding b, Node node)
    {
        if (ReferenceEquals(b.Value, Unset))
            Fail(node, "Variable or field has not been initialized");
        return b.Value;
    }
    public void Access(Node member, Class cls, Class? owner, Node node)
    {
        cls = member.Owner ?? cls;
        if (member.Access == "private" && owner != cls)
            Fail(node, $"'{member.Name}' is private to {cls.Name}");
    }
    Binding Field(object? value, string name, Scope scope, Node node)
    {
        if (value is not Instance obj)
            throw new Fault("Field access requires an object", node.Token);
        if (!obj.Class.Fields.TryGetValue(name, out var field))
            throw new Fault($"Unknown field '{name}'", node.Token);
        Access(field, obj.Class, scope.Owner, node);
        return obj.Fields[name];
    }
    public object? Member(object? obj, string name, Scope scope, Node node)
    {
        if (Builtins.Signature(TypeOf(obj), name) is not null)
            return new Builtin(obj!, name);
        if (name == "length")
        {
            if (obj is string text)
                return Numbers.Int(text.EnumerateRunes().Count());
            if (obj is Collection a)
                return Numbers.Int(a.Items.Count);
        }
        if (obj is Enumeration en)
            return en.Values.TryGetValue(name, out var val) ? val : throw new Fault($"Unknown enum value '{name}'", node.Token);
        Class? cls = obj switch
        {
            Class c => c,
            Instance i => i.Class,
            Super s => s.Class,
            _ => null
        };
        if (cls is null)
            throw new Fault($"Cannot access '{name}' on {Format(obj)}", node.Token);
        if (obj is Instance && cls.Fields.ContainsKey(name))
            return Read(Field(obj, name, scope, node), node);
        if (cls.Enums.TryGetValue(name, out var e))
        {
            Access(e.Declaration, cls, scope.Owner, node);
            return e;
        }
        if (!cls.Methods.TryGetValue(name, out var m) || m.Constructor)
            throw new Fault($"Unknown member '{name}' on {cls.Name}", node.Token);
        Access(m, cls, scope.Owner, node);
        if (!m.Static && obj is Class)
            Fail(node, $"Method '{name}' needs an instance");
        return new Method(m.Owner ?? cls, m.Static ? null : obj is Super parent ? parent.Self : (Instance?)obj, m);
    }
    object? Resolve(string name, Scope scope, Node node)
    {
        if (name == "me")
            return scope.Self ?? throw new Fault("me is unavailable in a static method", node.Token);
        if (name == "super")
            return scope.Self is not null && scope.Owner?.Parent is { } p ? new Super(p, scope.Self) : throw new Fault("super requires a subclass instance", node.Token);
        var local = scope.Find(name);
        if (local is not null)
            return Read(local, node);
        if (scope.Self is not null && scope.Owner!.Fields.ContainsKey(name))
            return Member(scope.Self, name, scope, node);
        if (scope.Owner?.Enums.TryGetValue(name, out var e) == true)
        {
            Access(e.Declaration, scope.Owner, scope.Owner, node);
            return e;
        }
        if (scope.Owner?.Lifecycle is { } life && scope.Owner.Enums[life.Type].Values.TryGetValue(name, out var state))
            return state;
        if (scope.Owner?.Methods.ContainsKey(name) == true)
            return Member((object?)scope.Self ?? scope.Owner, name, scope, node);
        string? className = scope.Owner?.Aliases is { } aliases ? aliases.GetValueOrDefault(name) : name;
        if (className is not null && Classes.TryGetValue(className, out var cls))
            return cls;
        if (name == "print")
            return new PrintFunction();
        if (Numbers.Primitives.Contains(name))
            return new Conversion(name);
        throw new Fault($"Unknown name '{name}'", node.Token);
    }
    Binding Reference(Node node, Scope scope)
    {
        Binding? b = null;
        if (node.Kind == "name")
        {
            b = scope.Find(node.Name);
            if (b is null && scope.Self is not null)
                b = Field(scope.Self, node.Name, scope, node);
        }
        else if (node.Kind == "member")
            b = Field(Eval(node.Object!, scope), node.Name, scope, node);
        else if (node.Kind == "index")
        {
            var obj = Eval(node.Object!, scope);
            int index = Index(Eval(node.Index!, scope), node);
            if (obj is not Collection c)
                throw new Fault("Only arrays and Lists support indexed assignment", node.Token);
            Bounds(c.Items.Count, index, node);
            b = new(c.Element, c.Items[index], c.Owner)
            {
                Collection = c,
                Index = index
            };
        }
        if (b is null)
            throw new Fault("Unknown assignment target", node.Token);
        if (b.ReadOnly)
            Fail(node, "Cannot assign to a const binding, loop counter, lifecycle field, or belongsTo reference directly");
        return b;
    }
    void Detach(Binding b)
    {
        if (b.Value is not Instance old || old.OwnerSlot != b)
            return;
        old.OwnerSlot = null;
        if (b.Definition?.Inverse is { } inverse)
            old.Fields[inverse].Value = null;
    }
    object? Write(Binding b, object? value, Node node)
    {
        value = CheckType(b.Type, value, b.Owner, node);
        if (b.Collection is { } c)
        {
            Bounds(c.Items.Count, b.Index, node);
            c.Items[b.Index] = value;
            return value;
        }
        if (b.Definition?.Relationship == "owns")
        {
            if (value is Instance child)
            {
                if (child.OwnerSlot is not null && child.OwnerSlot != b)
                    Fail(node, "Object already has an owner; detach it before assigning a new owner");
                for (var ancestor = b.Object; ancestor is not null; ancestor = ancestor.OwnerSlot?.Object)
                    if (ancestor == child)
                        Fail(node, "Ownership cycles are forbidden");
                if (child.Constructing)
                    Fail(node, "Cannot take ownership of an object before its constructor finishes");
            }
            Detach(b);
            b.Value = value;
            if (value is Instance attached)
            {
                attached.OwnerSlot = b;
                if (b.Definition.Inverse is { } inverse)
                    attached.Fields[inverse].Value = b.Object;
            }
        }
        else
            b.Value = value;
        return value;
    }
    public object? Binary(string op, object? a, object? b, Node node)
    {
        if (a is Number x && b is Number y)
            return Numbers.Binary(op, x, y, node.Token);
        if (a is Character ac && b is Character bc && op is "==" or "!=" or "<" or ">" or "<=" or ">=")
            return Numbers.Binary(op, Numbers.Int(ac.Text.EnumerateRunes().First().Value), Numbers.Int(bc.Text.EnumerateRunes().First().Value), node.Token);
        if (op == "==")
            return Equals(a, b);
        if (op == "!=")
            return !Equals(a, b);
        if (op == "+" && (a is string || b is string))
            return Format(a) + Format(b);
        throw new Fault($"Invalid operands for '{op}'", node.Token);
    }
    public object? Eval(Node node, Scope scope)
    {
        Tick(node);
        switch (node.Kind)
        {
            case "literal":
                return node.Value;
            case "name":
                return Resolve(node.Name, scope, node);
            case "member":
                return Member(Eval(node.Object!, scope), node.Name, scope, node);
            case "index":
                var obj = Eval(node.Object!, scope);
                int index = Index(Eval(node.Index!, scope), node);
                if (obj is string text)
                {
                    var chars = text.EnumerateRunes().ToArray();
                    Bounds(chars.Length, index, node);
                    return Numbers.Character(chars[index].ToString(), node.Token);
                }
                if (obj is not Collection c)
                    throw new Fault("Indexing requires an array, List, or string", node.Token);
                Bounds(c.Items.Count, index, node);
                return c.Items[index];
            case "unary":
                var operand = Eval((Node)node.Value!, scope);
                return node.Op == "!" ? !Bool(operand, node) : Numbers.Unary(node.Op, operand, node.Token);
            case "binary":
                var left = Eval(node.Left!, scope);
                if (node.Op == "&&")
                    return Bool(left, node) && Bool(Eval(node.Right!, scope), node);
                if (node.Op == "||")
                    return Bool(left, node) || Bool(Eval(node.Right!, scope), node);
                return Binary(node.Op, left, Eval(node.Right!, scope), node);
            case "assign":
                var binding = Reference(node.Left!, scope);
                var old = node.Op == "=" ? null : Read(binding, node);
                var right = Eval(node.Right!, scope);
                var value = node.Op == "=" ? right : Binary(node.Op[..1], old, right, node);
                if (node.Op != "=" && Numbers.Is(binding.Type.TrimEnd('?')))
                    value = Numbers.Convert(binding.Type.TrimEnd('?'), value, node.Token);
                return Write(binding, value, node);
            case "update":
                var target = Reference((Node)node.Value!, scope);
                var previous = Read(target, node);
                Write(target, Numbers.Convert(target.Type.TrimEnd('?'), Binary("+", previous, Numbers.Int(node.Step), node), node.Token), node);
                return previous;
            case "switch":
                var selector = Eval((Node)node.Value!, scope);
                var arm = node.Items.First(a => a.Left is null || Bool(Binary("==", selector, Eval(a.Left, scope), node), node));
                var chosen = Eval(arm.Right!, scope);
                return node.Type == "null" ? chosen : CheckType(node.Type, chosen, scope.Owner, node);
            case "new":
                return Create(node.Name, node.Args.Select(a => Eval(a, scope)).ToList(), scope.Owner, node);
            case "array":
                var items = node.Items.Select(i => Eval(i, scope)).ToList();
                string element = node.ResolvedElementType;
                if (element == "")
                {
                    if (items.Count == 0)
                        Fail(node, "Empty array literals require a declared element type");
                    element = TypeOf(items[0]);
                    foreach (var item in items.Skip(1))
                    {
                        string next = TypeOf(item);
                        if (Numbers.Widens(next, element))
                            element = next;
                        else if (next != element && !Numbers.Widens(element, next))
                            Fail(node, "Array elements need a common type");
                    }
                }
                return Collection("array", element, items, scope.Owner, node);
            case "newArray":
                int size = Index(Eval((Node)node.Value!, scope), node);
                Size(size, node);
                return Collection("array", node.Type, Enumerable.Repeat(Default(node.Type, node), size).ToList(), scope.Owner, node);
            case "newList":
                if (node.Args.Count > 0)
                    Fail(node, "List<A>() takes no constructor arguments");
                return Collection("list", node.Name[5..^1], [], scope.Owner, node);
            case "call":
                var callee = Eval(node.Callee!, scope);
                var args = node.Args.Select(a => Eval(a, scope)).ToList();
                if (callee is Class constructedClass)
                    return Create(constructedClass.Name, args, scope.Owner, node);
                if (callee is PrintFunction)
                {
                    Print(string.Join(' ', args.Select(x => Format(x))));
                    return null;
                }
                if (callee is Conversion conversion)
                {
                    if (args.Count != 1)
                        Fail(node, "Conversion expects one argument");
                    return conversion.Type switch
                    {
                        "string" => Format(args[0]),
                        "bool" => Bool(args[0], node),
                        "char" => Numbers.ConvertChar(args[0], node.Token),
                        _ => Numbers.Convert(conversion.Type, args[0], node.Token)
                    };
                }
                if (callee is Builtin builtin)
                    return Builtins.Call(this, builtin, args, node);
                if (callee is not Method m)
                    throw new Fault("Value is not callable", node.Token);
                return Invoke(m, args, node);
            default:
                throw new Fault($"Unknown expression '{node.Kind}'", node.Token);
        }
    }
    public void Statement(Node node, Scope scope)
    {
        Tick(node);
        switch (node.Kind)
        {
            case "block":
                var local = new Scope(scope);
                foreach (var s in node.Statements)
                    Statement(s, local);
                break;
            case "declare":
                Declare(scope, node.Name, node.Type, node.Value is Node initial ? Eval(initial, scope) : Unset, node, node.Const);
                break;
            case "expression":
                Eval((Node)node.Value!, scope);
                break;
            case "return":
                throw new Flow("return", node.Value is Node ret ? Eval(ret, scope) : null);
            case "break":
            case "continue":
                throw new Flow(node.Kind);
            case "require":
                if (!Bool(Eval(node.Condition!, scope), node))
                    Fail(node, "Precondition failed");
                break;
            case "if":
                if (Bool(Eval(node.Condition!, scope), node))
                    Statement(node.Yes!, scope);
                else if (node.No is not null)
                    Statement(node.No, scope);
                break;
            case "foreach":
                var source = Eval((Node)node.Value!, scope);
                var snapshot = source is string text ? text.EnumerateRunes().Select(c => (object?)Numbers.Character(c.ToString(), node.Token)).ToList() : new List<object?>(((Collection)source!).Items);
                foreach (var item in snapshot)
                {
                    Tick(node);
                    var eachScope = new Scope(scope);
                    Declare(eachScope, node.Name, node.Type, item, node, true);
                    if (Loop(node.Body!, eachScope) == "break")
                        break;
                }
                break;
            case "for":
                int start = Index(Eval(node.Start!, scope), node), end = Index(Eval(node.End!, scope), node);
                var loopScope = new Scope(scope);
                var counter = Declare(loopScope, node.Name, "int", Numbers.Int(start), node, true);
                for (long i = start; node.Step > 0 ? i < end : i > end; i += node.Step)
                {
                    Tick(node);
                    counter.Value = Numbers.Int((int)i);
                    if (Loop(node.Body!, loopScope) == "break")
                        break;
                }
                break;
            case "while":
                while (Bool(Eval(node.Condition!, scope), node))
                {
                    Tick(node);
                    if (Loop(node.Body!, scope) == "break")
                        break;
                }
                break;
            case "throw":
                throw new Thrown((Instance)CheckType("Error", Eval((Node)node.Value!, scope), scope.Owner, node)!, node.Token);
            case "try":
                try
                {
                    Statement(node.Body!, scope);
                }
                catch (Fault error) { if (error.Fatal) throw; var thrown = Exception(error, node); var handler = node.Catches.FirstOrDefault(h => Subtype(thrown.Value.Class, h.Type)); if (handler is null) throw; var caught = new Scope(scope); Declare(caught, handler.Name, handler.Type, thrown.Value, handler); Statement(handler.Body!, caught); }
                finally { if (node.Finalizer is not null) Statement(node.Finalizer, scope); }
                break;
            case "using":
                var resource = Eval((Node)node.Value!, scope);
                var usingScope = new Scope(scope);
                Declare(usingScope, node.Name, node.Type, resource, node, true);
                Exception? pending = null;
                try
                {
                    Statement(node.Body!, usingScope);
                }
                catch (Exception error) { pending = error; }
                try
                {
                    Invoke((Method)Member(resource, "close", usingScope, node)!, [], node);
                }
                catch (Exception error) { if (pending is Fault fault) fault.Suppressed.Add(error); else pending = error; }
                if (pending is not null)
                    System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(pending).Throw();
                break;
            case "superCall":
                Fail(node, "super(...) must be the first constructor statement");
                break;
            default:
                Fail(node, $"Unknown statement '{node.Kind}'");
                break;
        }
    }
    string Loop(Node body, Scope scope)
    {
        try
        {
            Statement(body, scope);
        }
        catch (Flow flow) when (flow.Kind is "break" or "continue") { return flow.Kind; }
        return "";
    }
    public Thrown Exception(Fault error, Node node)
    {
        if (error is Thrown thrown)
            return thrown;
        return new(Create("RuntimeError", [error.Message], null, node), error.At)
        {
            Frames = error.Frames,
            Suppressed = error.Suppressed
        };
    }
    public Instance Create(string name, List<object?> args, Class? caller, Node node)
    {
        if (!Classes.TryGetValue(name, out var cls))
            throw new Fault($"Unknown class '{name}'", node.Token);
        if (cls.IsInterface)
            Fail(node, $"Cannot construct interface '{name}'");
        if (cls.Abstract)
            Fail(node, $"Cannot construct abstract class '{name}'");
        Enter(node);
        var obj = new Instance(cls);
        try
        {
            foreach (var f in cls.Fields.Values)
                obj.Fields[f.Name] = new(f.Type, f.Relationship == "belongsTo" ? null : Unset, f.Owner, f.Lifecycle || f.Relationship == "belongsTo")
                {
                    Definition = f,
                    Object = obj
                };
            if (cls.OwnMethods.TryGetValue(cls.Name, out var ctor))
                Access(ctor, cls, caller, node);
            Initialize(cls, obj, args, node);
            obj.Constructing = false;
            return obj;
        }
        catch { foreach (var b in obj.Fields.Values) if (b.Definition?.Relationship == "owns") Detach(b); throw; }
        finally { depth--; }
    }
    void Initialize(Class cls, Instance obj, List<object?> args, Node node)
    {
        var ctor = cls.OwnMethods.GetValueOrDefault(cls.Name);
        var scope = new Scope(null, cls, obj);
        if (args.Count != (ctor?.Params.Count ?? 0))
            Fail(node, $"{cls.Name} expects {ctor?.Params.Count ?? 0} arguments");
        if (ctor is not null)
            for (int i = 0; i < args.Count; i++)
                Declare(scope, ctor.Params[i].Name, ctor.Params[i].Type, args[i], ctor.Params[i]);
        var first = ctor?.Body?.Statements.FirstOrDefault();
        if (cls.Parent is { } parent)
        {
            if (parent.OwnMethods.TryGetValue(parent.Name, out var pc))
                Access(pc, parent, cls, node);
            Initialize(parent, obj, first?.Kind == "superCall" ? first.Args.Select(a => Eval(a, scope)).ToList() : [], node);
        }
        foreach (var f in cls.OwnFields.Values)
            if (f.Init is not null)
            {
                Write(obj.Fields[f.Name], Eval(f.Init, scope), f);
                if (f.Const)
                    obj.Fields[f.Name].ReadOnly = true;
            }
        if (ctor is not null)
        {
            try
            {
                var body = new Node("block", ctor.Body!.Token) { Statements = ctor.Body.Statements.Skip(first?.Kind == "superCall" ? 1 : 0).ToList() };
                Statement(body, scope);
            }
            catch (Flow flow) when (flow.Kind == "return") { if (flow.Value is not null) Fail(node, "A constructor cannot return a value"); }
        }
    }
    public object? Invoke(Method callee, List<object?> args, Node node)
    {
        var method = callee.Declaration;
        var cls = method.Owner ?? callee.Class;
        var self = callee.Self;
        if (method.Abstract || method.Body is null)
            Fail(node, "Cannot invoke an abstract method");
        if (self?.Constructing == true && self.Fields.Values.Any(b => ReferenceEquals(b.Value, Unset)))
            Fail(node, "Cannot call an instance method before all fields are initialized");
        if (args.Count != method.Params.Count)
            Fail(node, $"{method.Name} expects {method.Params.Count} arguments, got {args.Count}");
        Enter(node);
        bool transition = false;
        try
        {
            var scope = new Scope(null, cls, self);
            for (int i = 0; i < args.Count; i++)
                Declare(scope, method.Params[i].Name, method.Params[i].Type, args[i], method.Params[i]);
            if (method.Native != "")
            {
                var result = Standard.Invoke(this, method.Native, self, method.Params.Select(p => scope.Locals[p.Name].Value).ToList(), node);
                return method.Type == "void" ? null : CheckType(method.Type, result, cls, method);
            }
            if (method.From != "")
            {
                var state = (EnumValue)Read(self!.Fields[cls.Lifecycle!.Name], method)!;
                if (state.Name != method.From)
                    Fail(node, $"Expected state {method.From}; actual: {state.Name}");
            }
            if (method.To != "")
            {
                if (self!.Transitioning)
                    Fail(node, "A lifecycle transition is already in progress on this object");
                self.Transitioning = true;
                transition = true;
            }
            object? value = null;
            try
            {
                Statement(method.Body!, scope);
            }
            catch (Flow flow) when (flow.Kind == "return") { value = flow.Value; }
            if (method.Type == "void")
            {
                if (value is not null)
                    Fail(method, "A void method cannot return a value");
            }
            else
                value = CheckType(method.Type, value, cls, method);
            if (method.To != "")
                self!.Fields[cls.Lifecycle!.Name].Value = cls.Enums[cls.Lifecycle.Type].Values[method.To];
            return value;
        }
        catch (Fault error) { error.Frames.Add($"{cls.Name}.{method.Name} ({node.Token.File}:{node.Token.Line}:{node.Token.Column})"); throw; }
        finally { depth--; if (transition) self!.Transitioning = false; }
    }
    public void Run(string entry, string[] args)
    {
        if (!Classes.TryGetValue(entry, out var cls))
            throw new Fault($"Entry class '{entry}' was not found");
        var m = cls.Methods.GetValueOrDefault("main");
        if (m is null || !m.Static || m.Access != "public" || m.Type != "void")
            Fail(cls.Declaration, "Entry requires public static main() -> void or main(args: string[]) -> void");
        if (m!.Params.Count > 1 || m.Params.Count == 1 && m.Params[0].Type != "string[]")
            Fail(m, "main accepts either no parameters or args: string[]");
        Invoke(new(cls, null, m), m.Params.Count == 0 ? [] : [Collection("array", "string", args.Cast<object?>().ToList(), cls, m)], m);
    }
}
