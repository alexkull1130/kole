using System.Globalization;
using System.Numerics;
using System.Text;

namespace Kole;

sealed record Number(string Type, BigInteger Integer, float Real = 0)
{
    public double Double => Type == "float" ? Real : (double)Integer;
}
sealed record Character(string Text);
static class Numbers
{
    public static readonly string[] Numeric = ["byte", "short", "int", "long", "float"];
    public static readonly string[] Primitives = [.. Numeric, "char", "bool", "string"];
    public static bool Is(string type) => Numeric.Contains(type);
    public static bool Widens(string expected, string actual) => Is(expected) && Is(actual) && Array.IndexOf(Numeric, actual) <= Array.IndexOf(Numeric, expected);
    public static string Promote(string a, string? b = null) => a == "float" || b == "float" ? "float" : a == "long" || b == "long" ? "long" : "int";
    static (BigInteger, BigInteger) Range(string t) => t switch { "byte" => (-128, 127), "short" => (-32768, 32767), "int" => (int.MinValue, int.MaxValue), "long" => (long.MinValue, long.MaxValue), _ => throw new InvalidOperationException(t) };
    public static Number Make(string t, BigInteger value, Token? at = null)
    {
        if (t == "float")
            return Make(t, (double)value, at);
        var (min, max) = Range(t);
        if (value < min || value > max)
            throw new Fault($"{t} overflow: {value} is outside its range", at);
        return new(t, value);
    }
    public static Number Make(string t, double value, Token? at = null)
    {
        if (t != "float")
            return Make(t, new BigInteger(Math.Truncate(value)), at);
        float f = (float)value;
        if (!float.IsFinite(f))
            throw new Fault("float overflow: result is not finite", at);
        return new(t, 0, f);
    }
    public static Number Int(int value) => Make("int", new BigInteger(value));
    public static bool Fits(string type, Number? n)
    {
        if (type is not ("byte" or "short") || n?.Type != "int")
            return false;
        var (min, max) = Range(type);
        return n.Integer >= min && n.Integer <= max;
    }
    public static Number Literal(string text, Token at)
    {
        bool lng = text.EndsWith('L') || text.EndsWith('l'), flt = text.EndsWith('f') || text.EndsWith('F') || text.IndexOfAny(['.', 'e', 'E']) >= 0;
        string raw = text.TrimEnd('l', 'L', 'f', 'F');
        if (lng && flt)
            throw new Fault("A long literal cannot have a decimal point or exponent", at);
        if (flt)
            return Make("float", double.Parse(raw, CultureInfo.InvariantCulture), at);
        var n = BigInteger.Parse(raw, CultureInfo.InvariantCulture);
        return Make(lng || n < int.MinValue || n > int.MaxValue ? "long" : "int", n, at);
    }
    public static Character Character(string text, Token? at = null)
    {
        var scalars = text.EnumerateRunes().ToArray();
        if (scalars.Length != 1 || text.Length == 1 && char.IsSurrogate(text[0]))
            throw new Fault("char requires exactly one Unicode scalar value", at);
        return new(text);
    }
    public static Number Convert(string type, object? input, Token at)
    {
        if (input is Character c)
            input = Int(c.Text.EnumerateRunes().First().Value);
        if (input is not Number n)
            throw new Fault($"Conversion to {type} requires a number or char", at);
        return n.Type == "float" ? Make(type, n.Real, at) : Make(type, n.Integer, at);
    }
    public static Character ConvertChar(object? input, Token at)
    {
        if (input is Character c)
            return c;
        if (input is string s)
            return Character(s, at);
        if (input is not Number n || n.Type == "float" || n.Integer < 0 || n.Integer > 0x10ffff || !Rune.IsValid((int)n.Integer))
            throw new Fault("char conversion requires a valid Unicode scalar value", at);
        return Character(new Rune((int)n.Integer).ToString(), at);
    }
    public static Number Unary(string op, object? input, Token at)
    {
        if (input is not Number n)
            throw new Fault("Expected a number", at);
        return n.Type == "float" ? Make(Promote(n.Type), op == "-" ? -n.Real : n.Real, at) : Make(Promote(n.Type), op == "-" ? -n.Integer : n.Integer, at);
    }
    public static object Binary(string op, Number left, Number right, Token at)
    {
        string type = Promote(left.Type, right.Type);
        if (type == "float")
        {
            double a = (float)left.Double, b = (float)right.Double;
            if (op is "/" or "%" && b == 0)
                throw new Fault("Division by zero", at);
            return op switch
            {
                "==" => a == b,
                "!=" => a != b,
                "<" => a < b,
                ">" => a > b,
                "<=" => a <= b,
                ">=" => a >= b,
                "+" => Make(type, a + b, at),
                "-" => Make(type, a - b, at),
                "*" => Make(type, a * b, at),
                "/" => Make(type, a / b, at),
                "%" => Make(type, a % b, at),
                _ => throw new Fault("Unknown operator", at)
            };
        }
        var x = left.Integer;
        var y = right.Integer;
        if (op is "/" or "%" && y == 0)
            throw new Fault("Division by zero", at);
        return op switch
        {
            "==" => x == y,
            "!=" => x != y,
            "<" => x < y,
            ">" => x > y,
            "<=" => x <= y,
            ">=" => x >= y,
            "+" => Make(type, x + y, at),
            "-" => Make(type, x - y, at),
            "*" => Make(type, x * y, at),
            "/" => Make(type, x / y, at),
            "%" => Make(type, x % y, at),
            _ => throw new Fault("Unknown operator", at)
        };
    }
    public static string Text(Number n)
    {
        if (n.Type != "float")
            return n.Integer.ToString(CultureInfo.InvariantCulture);
        if (n.Real == 0)
            return "0";
        double value = n.Real;
        for (int digits = 1; digits <= 9; digits++)
        {
            double candidate = double.Parse(value.ToString("G" + digits, CultureInfo.InvariantCulture), CultureInfo.InvariantCulture);
            if ((float)candidate != n.Real)
                continue;
            double abs = Math.Abs(candidate);
            if (abs >= 0.000001 && abs < 1e21)
                return candidate.ToString("0.###############################", CultureInfo.InvariantCulture);
            return candidate.ToString("G", CultureInfo.InvariantCulture).Replace("E-0", "e-").Replace("E+0", "e+").Replace("E", "e");
        }
        return value.ToString(CultureInfo.InvariantCulture);
    }
}

sealed record EnumValue(string Owner, string Type, string Name);
sealed class Enumeration(string owner, Node declaration)
{
    public string Owner = owner; public Node Declaration = declaration; public Dictionary<string, EnumValue> Values = declaration.Values.ToDictionary(name => name, name => new EnumValue(owner, declaration.Name, name));
}
sealed class Class(Node declaration)
{
    public string Name = declaration.Name; public Node Declaration = declaration; public Class? Parent; public Node? Lifecycle;
    public Dictionary<string, Node> Fields = [], Methods = [], OwnFields = [], OwnMethods = [];
    public Dictionary<string, Enumeration> Enums = [];
    public HashSet<string> Interfaces = [.. declaration.Interfaces];
    public Dictionary<string, string>? Aliases = declaration.Aliases;
    public bool IsInterface => Declaration.Interface;
    public bool Abstract => Declaration.Abstract;
}
sealed class Instance(Class cls)
{
    public Class Class = cls; public Dictionary<string, Binding> Fields = []; public bool Constructing = true, Transitioning; public Binding? OwnerSlot; public object? Native;
}
sealed class Collection(string kind, string element, List<object?> items, Class? owner)
{
    public string Kind = kind, Element = element; public string Type => Kind == "array" ? Element + "[]" : $"List<{Element}>"; public List<object?> Items = items; public Class? Owner = owner;
}
sealed class Binding(string type, object? value, Class? owner = null, bool readOnly = false)
{
    public string Type = type; public object? Value = value; public Class? Owner = owner; public bool ReadOnly = readOnly; public Node? Definition; public Instance? Object; public Collection? Collection; public int Index;
}
sealed class Scope(Scope? parent = null, Class? owner = null, Instance? self = null)
{
    public Scope? Parent = parent; public Class? Owner = owner ?? parent?.Owner; public Instance? Self = self ?? parent?.Self; public Dictionary<string, Binding> Locals = []; public Binding? Find(string name) => Locals.GetValueOrDefault(name) ?? Parent?.Find(name);
}
sealed record Method(Class Class, Instance? Self, Node Declaration);
sealed record Super(Class Class, Instance Self);
sealed record Builtin(object Object, string Name);
sealed record Conversion(string Type);
sealed class PrintFunction;
sealed class Flow(string kind, object? value = null) : Exception
{
    public string Kind = kind; public object? Value = value;
}
sealed class Thrown(Instance value, Token? token = null) : Fault((string)value.Fields["message"].Value!, token)
{
    public Instance Value = value;
}

static class Builtins
{
    public static (string[] Params, string Returns)? Signature(string type, string name)
    {
        if (type == "string")
            return name switch
            {
                "isEmpty" => ([], "bool"),
                "contains" or "startsWith" or "endsWith" => (["string"], "bool"),
                "indexOf" or "lastIndexOf" => (["string"], "int"),
                "charAt" => (["int"], "char"),
                "substring" => (["int", "int"], "string"),
                "trim" or "toUpperCase" or "toLowerCase" => ([], "string"),
                "replace" => (["string", "string"], "string"),
                "split" => (["string"], "string[]"),
                "repeat" => (["int"], "string"),
                "toCharArray" => ([], "char[]"),
                _ => null
            };
        bool list = type.StartsWith("List<") && type.EndsWith('>'), array = type.EndsWith("[]");
        if (!list && !array)
            return null;
        string a = list ? type[5..^1] : type[..^2];
        return name switch
        {
            "get" => (["int"], a),
            "set" => (["int", a], "void"),
            "isEmpty" => ([], "bool"),
            "contains" => ([a], "bool"),
            "indexOf" or "lastIndexOf" => ([a], "int"),
            "first" or "last" => ([], a),
            "reverse" => ([], "void"),
            "copy" => ([], type),
            "slice" => (["int", "int"], type),
            "join" => (["string"], "string"),
            "toArray" => ([], a + "[]"),
            "toList" => ([], $"List<{a}>"),
            "add" when list => ([a], "void"),
            "addAll" when list => ([a + "[]"], "void"),
            "insert" when list => (["int", a], "void"),
            "remove" when list => ([a], "bool"),
            "removeAt" when list => (["int"], a),
            "clear" when list => ([], "void"),
            _ => null
        };
    }
    public static object? Call(Runtime r, Builtin method, List<object?> args, Node node)
    {
        var (obj, name) = (method.Object, method.Name);
        string type = r.TypeOf(obj);
        var sig = Signature(type, name) ?? throw new Fault("Unknown builtin", node.Token);
        if (args.Count != sig.Params.Length)
            throw new Fault($"{type}.{name} expects {sig.Params.Length} arguments", node.Token);
        args = args.Select((arg, i) => r.CheckType(sig.Params[i], arg, (obj as Collection)?.Owner, node)).ToList();
        (int, int) Range(int length)
        {
            int start = r.Index(args[0], node), end = r.Index(args[1], node);
            if (start < 0 || end < start || end > length)
                throw new Fault("Invalid slice range", node.Token);
            return (start, end - start);
        }
        if (obj is string text)
        {
            var chars = text.EnumerateRunes().Select(x => x.ToString()).ToList();
            switch (name)
            {
                case "isEmpty":
                    return text.Length == 0;
                case "contains":
                    return text.Contains((string)args[0]!, StringComparison.Ordinal);
                case "startsWith":
                    return text.StartsWith((string)args[0]!, StringComparison.Ordinal);
                case "endsWith":
                    return text.EndsWith((string)args[0]!, StringComparison.Ordinal);
                case "indexOf":
                case "lastIndexOf":
                    int ix = name == "indexOf" ? text.IndexOf((string)args[0]!, StringComparison.Ordinal) : text.LastIndexOf((string)args[0]!, StringComparison.Ordinal);
                    return Numbers.Int(ix < 0 ? -1 : text[..ix].EnumerateRunes().Count());
                case "charAt":
                    int i = r.Index(args[0], node);
                    r.Bounds(chars.Count, i, node);
                    return Numbers.Character(chars[i], node.Token);
                case "substring":
                    var (start, count) = Range(chars.Count);
                    return string.Concat(chars.GetRange(start, count));
                case "toUpperCase":
                    return text.ToUpperInvariant();
                case "toLowerCase":
                    return text.ToLowerInvariant();
                case "trim":
                    return text.Trim();
                case "replace":
                    if ((string)args[0]! == "")
                        throw new Fault("replace requires a nonempty search string", node.Token);
                    return text.Replace((string)args[0]!, (string)args[1]!, StringComparison.Ordinal);
                case "split":
                    var pieces = (string)args[0]! == "" ? chars : [.. text.Split((string)args[0]!, StringSplitOptions.None)];
                    return r.Collection("array", "string", pieces.Cast<object?>().ToList(), null, node);
                case "toCharArray":
                    return r.Collection("array", "char", chars.Select(x => (object?)Numbers.Character(x, node.Token)).ToList(), null, node);
                case "repeat":
                    int repeats = r.Index(args[0], node);
                    if (repeats < 0 || repeats > 100000 || (long)chars.Count * repeats > 100000)
                        throw new Fault("Repeated string length/count must be between 0 and 100000", node.Token);
                    return string.Concat(Enumerable.Repeat(text, repeats));
            }
        }
        var collection = (Collection)obj;
        var items = collection.Items;
        int Find(bool reverse)
        {
            for (int i = reverse ? items.Count - 1 : 0; reverse ? i >= 0 : i < items.Count; i += reverse ? -1 : 1)
            if ((bool)r.Binary("==", items[i], args[0], node)!)
                return i;
            return -1;
        }
        switch (name)
        {
            case "isEmpty":
                return items.Count == 0;
            case "contains":
                return Find(false) >= 0;
            case "indexOf":
                return Numbers.Int(Find(false));
            case "lastIndexOf":
                return Numbers.Int(Find(true));
            case "remove":
                int i = Find(false);
                if (i < 0)
                    return false;
                items.RemoveAt(i);
                return true;
            case "first":
                r.Bounds(items.Count, 0, node);
                return items[0];
            case "last":
                r.Bounds(items.Count, items.Count - 1, node);
                return items[^1];
            case "clear":
                items.Clear();
                return null;
            case "reverse":
                items.Reverse();
                return null;
            case "join":
                return string.Join((string)args[0]!, items.Select(x => r.Format(x)));
            case "copy":
            case "toArray":
            case "toList":
            case "slice":
                var copy = new List<object?>(items);
                if (name == "slice")
                {
                    var (start, count) = Range(items.Count);
                    copy = items.GetRange(start, count);
                }
                return r.Collection(name == "toArray" ? "array" : name == "toList" ? "list" : collection.Kind, collection.Element, copy, collection.Owner, node);
            case "add":
                r.Size(items.Count + 1, node);
                items.Add(args[0]);
                return null;
            case "addAll":
                var extra = ((Collection)args[0]!).Items;
                r.Size(items.Count + extra.Count, node);
                items.AddRange(extra);
                return null;
            case "insert":
                int index = r.Index(args[0], node);
                if (index < 0 || index > items.Count)
                    throw new Fault("Insert index out of bounds", node.Token);
                r.Size(items.Count + 1, node);
                items.Insert(index, args[1]);
                return null;
            default:
                int at = r.Index(args[0], node);
                r.Bounds(items.Count, at, node);
                if (name == "get")
                    return items[at];
                if (name == "removeAt")
                {
                    var old = items[at];
                    items.RemoveAt(at);
                    return old;
                }
                items[at] = args[1];
                return null;
        }
    }
}
