namespace Kole;

sealed class InitScope(InitScope? parent = null)
{
    public Dictionary<string, Node> Locals = []; public Node? Find(string name) => Locals.GetValueOrDefault(name) ?? parent?.Find(name);
}
sealed class Initialization(Class cls)
{
    bool constructing, instance = true;
    static HashSet<Node>? Intersect(HashSet<Node>? a, HashSet<Node>? b) => a is null ? b : b is null ? a : a.Intersect(b).ToHashSet();
    static Dictionary<string, HashSet<Node>> Merge(params Dictionary<string, HashSet<Node>>[] flows)
    {
        var result = new Dictionary<string, HashSet<Node>>();
        foreach (var flow in flows)
            foreach (var (kind, state) in flow)
                result[kind] = Intersect(result.GetValueOrDefault(kind), state)!;
        return result;
    }
    bool Complete(HashSet<Node> state) => cls.Fields.Values.All(state.Contains);
    void RequireComplete(HashSet<Node> state, Node node)
    {
        if (constructing && !Complete(state))
            Runtime.Fail(node, "Cannot use or expose me before all fields are initialized");
    }
    Node? Symbol(Node node, InitScope scope) => node.Kind == "name" ? scope.Find(node.Name) ?? (instance ? cls.Fields.GetValueOrDefault(node.Name) : null) : node.Kind == "member" && node.Object?.Kind == "name" && node.Object.Name == "me" ? cls.Fields.GetValueOrDefault(node.Name) : null;
    static void Read(Node? symbol, HashSet<Node> state, Node node)
    {
        if (symbol is not null && !state.Contains(symbol))
            Runtime.Fail(node, $"'{symbol.Name}' may be used before it is initialized");
    }
    (Node? Symbol, HashSet<Node> State) Target(Node node, InitScope scope, HashSet<Node> state, bool read)
    {
        var symbol = Symbol(node, scope);
        if (symbol is not null)
        {
            if (read)
                Read(symbol, state, node);
            return (symbol, state);
        }
        if (node.Kind == "member")
            state = Expression(node.Object!, scope, state);
        if (node.Kind == "index")
            state = Expression(node.Index!, scope, Expression(node.Object!, scope, state));
        return (null, state);
    }
    HashSet<Node> Expression(Node node, InitScope scope, HashSet<Node> incoming)
    {
        var state = new HashSet<Node>(incoming);
        switch (node.Kind)
        {
            case "name":
                if (node.Name == "me")
                    RequireComplete(state, node);
                else
                {
                    var symbol = Symbol(node, scope);
                    Read(symbol, state, node);
                    if (symbol is null && instance && cls.Methods.TryGetValue(node.Name, out var m) && !m.Static)
                        RequireComplete(state, node);
                }
                break;
            case "member":
                var field = Symbol(node, scope);
                if (field is not null)
                    Read(field, state, node);
                else
                    state = Expression(node.Object!, scope, state);
                break;
            case "index":
                state = Expression(node.Index!, scope, Expression(node.Object!, scope, state));
                break;
            case "unary":
                state = Expression((Node)node.Value!, scope, state);
                break;
            case "binary":
                if (node.Op is "&&" or "||")
                {
                    var (yes, no) = Condition(node, scope, state);
                    state = Intersect(yes, no) ?? state;
                }
                else
                    state = Expression(node.Right!, scope, Expression(node.Left!, scope, state));
                break;
            case "assign":
                var target = Target(node.Left!, scope, state, node.Op != "=");
                state = Expression(node.Right!, scope, target.State);
                if (target.Symbol is not null)
                    state.Add(target.Symbol);
                break;
            case "update":
                state = Target((Node)node.Value!, scope, state, true).State;
                break;
            case "call":
                state = Expression(node.Callee!, scope, state);
                foreach (var arg in node.Args)
                    state = Expression(arg, scope, state);
                break;
            case "switch":
                var switchReady = Expression((Node)node.Value!, scope, state);
                state = node.Items.Select(arm => Expression(arm.Right!, scope, new HashSet<Node>(switchReady))).Aggregate((a, b) => Intersect(a, b)!);
                break;
            case "new":
            case "newList":
                foreach (var arg in node.Args)
                    state = Expression(arg, scope, state);
                break;
            case "array":
                foreach (var item in node.Items)
                    state = Expression(item, scope, state);
                break;
            case "newArray":
                state = Expression((Node)node.Value!, scope, state);
                break;
        }
        return state;
    }
    (HashSet<Node>? Yes, HashSet<Node>? No) Condition(Node node, InitScope scope, HashSet<Node>? state)
    {
        if (state is null)
            return (null, null);
        if (node.Kind == "literal" && node.Value is bool b)
            return b ? (state, null) : (null, state);
        if (node.Kind == "unary" && node.Op == "!")
        {
            var (yes, no) = Condition((Node)node.Value!, scope, state);
            return (no, yes);
        }
        if (node.Kind == "binary" && node.Op is "&&" or "||")
        {
            var left = Condition(node.Left!, scope, state);
            var right = Condition(node.Right!, scope, node.Op == "&&" ? left.Yes : left.No);
            return node.Op == "&&" ? (right.Yes, Intersect(left.No, right.No)) : (Intersect(left.Yes, right.Yes), right.No);
        }
        var result = Expression(node, scope, state);
        return (result, result);
    }
    Dictionary<string, HashSet<Node>> Statement(Node node, InitScope scope, HashSet<Node>? state)
    {
        if (state is null)
            return [];
        switch (node.Kind)
        {
            case "block":
                var local = new InitScope(scope);
                var flow = new Dictionary<string, HashSet<Node>> { { "normal", state } };
                foreach (var child in node.Statements)
                {
                    if (!flow.TryGetValue("normal", out var normal))
                        break;
                    var next = Statement(child, local, normal);
                    flow.Remove("normal");
                    flow = Merge(flow, next);
                }
                return flow;
            case "declare":
                if (node.Value is Node initial)
                    state = Expression(initial, scope, state);
                scope.Locals[node.Name] = node;
                state = new(state);
                if (node.Value is not null)
                    state.Add(node);
                break;
            case "expression":
                state = Expression((Node)node.Value!, scope, state);
                break;
            case "return":
                return new() { { "return", node.Value is Node value ? Expression(value, scope, state) : state } };
            case "throw":
                return new() { { "throw", Expression((Node)node.Value!, scope, state) } };
            case "break":
            case "continue":
                return new() { { node.Kind, state } };
            case "require":
                var required = Condition(node.Condition!, scope, state).Yes;
                return required is null ? [] : new() { { "normal", required } };
            case "if":
                var paths = Condition(node.Condition!, scope, state);
                return Merge(Statement(node.Yes!, new(scope), paths.Yes), node.No is not null ? Statement(node.No, new(scope), paths.No) : paths.No is null ? [] : new() { { "normal", paths.No } });
            case "foreach":
            case "for":
                state = node.Kind == "foreach" ? Expression((Node)node.Value!, scope, state) : Expression(node.End!, scope, Expression(node.Start!, scope, state));
                var forScope = new InitScope(scope);
                forScope.Locals[node.Name] = node;
                var initialized = new HashSet<Node>(state) { node };
                var forFlow = Statement(node.Body!, forScope, initialized);
                return Merge(new() { { "normal", state } }, forFlow.TryGetValue("return", out var returned) ? new() { { "return", returned } } : []);
            case "while":
                var condition = Condition(node.Condition!, scope, state);
                var whileFlow = Statement(node.Body!, new(scope), condition.Yes);
                var exit = Intersect(condition.No, whileFlow.GetValueOrDefault("break"));
                var result = new Dictionary<string, HashSet<Node>>();
                if (exit is not null)
                    result["normal"] = exit;
                if (whileFlow.TryGetValue("return", out var returnState))
                    result["return"] = returnState;
                return result;
            case "using":
                state = Expression((Node)node.Value!, scope, state);
                var usingScope = new InitScope(scope);
                usingScope.Locals[node.Name] = node;
                return Statement(node.Body!, usingScope, new(state) { node });
            case "try":
                var tryFlow = Statement(node.Body!, new(scope), state);
                foreach (var handler in node.Catches)
                {
                    var catchScope = new InitScope(scope);
                    catchScope.Locals[handler.Name] = handler;
                    tryFlow = Merge(tryFlow, Statement(handler.Body!, catchScope, new(state) { handler }));
                }
                if (node.Finalizer is not null)
                {
                    Statement(node.Finalizer, new(scope), state);
                    var combined = new Dictionary<string, HashSet<Node>>();
                    foreach (var (kind, pending) in tryFlow)
                    {
                        var final = Statement(node.Finalizer, new(scope), pending);
                        var outcomes = new Dictionary<string, HashSet<Node>>();
                        foreach (var (outcome, ready) in final)
                            outcomes[outcome == "normal" ? kind : outcome] = ready;
                        combined = Merge(combined, outcomes);
                    }
                    tryFlow = combined;
                }
                return tryFlow;
        }
        return new() { { "normal", state } };
    }
    public void Check()
    {
        constructing = true;
        var initialized = cls.Fields.Values.Where(f => f.Relationship == "belongsTo" || f.Owner != cls).ToHashSet();
        foreach (var field in cls.OwnFields.Values)
            if (field.Init is not null)
            {
                initialized = Expression(field.Init, new(), initialized);
                initialized.Add(field);
            }
        var ctor = cls.Methods.GetValueOrDefault(cls.Name);
        var exits = new Dictionary<string, HashSet<Node>> { { "normal", initialized } };
        if (ctor is not null)
        {
            var scope = new InitScope();
            var state = new HashSet<Node>(initialized);
            foreach (var p in ctor.Params)
            {
                scope.Locals[p.Name] = p;
                state.Add(p);
            }
            var first = ctor.Body!.Statements.FirstOrDefault();
            if (first?.Kind == "superCall")
            {
                var before = ctor.Params.ToHashSet();
                foreach (var arg in first.Args)
                    before = Expression(arg, scope, before);
            }
            exits = Statement(new("block", ctor.Body.Token)
            {
                Statements = ctor.Body.Statements.Skip(first?.Kind == "superCall" ? 1 : 0).ToList()
            }, scope, state);
        }
        foreach (var (kind, state) in exits)
            if (kind is "normal" or "return")
                foreach (var field in cls.Fields.Values)
                    if (!state.Contains(field))
                        Runtime.Fail(ctor ?? field, $"Field '{field.Name}' must be initialized on every constructor path");
        constructing = false;
        foreach (var method in cls.OwnMethods.Values)
        {
            if (method.Constructor || method.Body is null)
                continue;
            instance = !method.Static;
            var scope = new InitScope();
            var state = cls.Fields.Values.ToHashSet();
            foreach (var p in method.Params)
            {
                scope.Locals[p.Name] = p;
                state.Add(p);
            }
            Statement(method.Body, scope, state);
        }
    }
}
