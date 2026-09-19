using System.Globalization;
using System.Numerics;
using System.Text;
using System.Text.RegularExpressions;

namespace Kole;

static class Standard
{
    public static readonly string[] Names = ["Error", "RuntimeError", "IOError", "Closeable", "Console", "File", "TextFile", "Math", "Int", "Float", "Map", "Set"];
    public static List<Node> With(List<Node> program)
    {
        using var stream = typeof(Standard).Assembly.GetManifestResourceStream("core.k")!;
        using var reader = new StreamReader(stream);
        var standard = Parser.Parse(reader.ReadToEnd(), "<kole>").Classes;
        foreach (var cls in standard)
        if (new[] { "Console", "File", "TextFile", "Math", "Int", "Float" }.Contains(cls.Name))
        foreach (var m in cls.Members)
        if (m.Kind == "method" && !m.Constructor)
            m.Native = cls.Name + "." + m.Name;
        foreach (var cls in program)
        if (cls.Aliases is { } aliases)
        foreach (var name in Names)
            aliases[name] = name;
        return [.. standard, .. program];
    }
    sealed class Handle(FileStream stream, string mode)
    {
        public FileStream Stream = stream; public string Mode = mode; public bool Closed; public List<string> Lines = []; public int Position;
    }
    static readonly UTF8Encoding Utf8 = new(false);
    static List<string> Lines(string text)
    {
        if (text == "")
            return [];
        var result = Regex.Split(text, "\r\n|\n|\r").ToList();
        if (result[^1] == "")
            result.RemoveAt(result.Count - 1);
        return result;
    }
    static void Replace(string path, string text)
    {
        string temporary = path + "." + Guid.NewGuid() + ".tmp";
        try
        {
            using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                byte[] bytes = Utf8.GetBytes(text);
                stream.Write(bytes);
                stream.Flush(true);
            }
            File.Move(temporary, path, true);
        }
        catch { try { File.Delete(temporary); } catch { } throw; }
    }
    public static object? Invoke(Runtime r, string name, Instance? self, List<object?> args, Node node)
    {
        Thrown Error(string message) => new(r.Create("IOError", [message], null, node), node.Token);
        if (name == "Console.readLine")
            return Console.ReadLine();
        if (name == "Console.write")
        {
            Console.Write((string)args[0]!);
            return null;
        }
        if (name == "Console.writeLine")
        {
            r.Print((string)args[0]!);
            return null;
        }
        if (name.StartsWith("Math."))
        {
            double a = ((Number)args[0]!).Double, b = args.Count > 1 ? ((Number)args[1]!).Double : 0;
            double result = name[5..] switch
            {
                "abs" => Math.Abs(a),
                "min" => Math.Min(a, b),
                "max" => Math.Max(a, b),
                "floor" => Math.Floor(a),
                "ceil" => Math.Ceiling(a),
                "round" => Math.Round(a, MidpointRounding.AwayFromZero),
                "sqrt" => Math.Sqrt(a),
                "pow" => Math.Pow(a, b),
                _ => throw new InvalidOperationException(name)
            };
            return Numbers.Make("float", result, node.Token);
        }
        if (name == "Int.parse")
        {
            string text = ((string)args[0]!).Trim();
            if (!Regex.IsMatch(text, @"^[+-]?\d+$"))
                throw new Fault("Invalid integer text", node.Token);
            return Numbers.Make("int", BigInteger.Parse(text, CultureInfo.InvariantCulture), node.Token);
        }
        if (name == "Float.parse")
        {
            string text = ((string)args[0]!).Trim();
            if (!Regex.IsMatch(text, @"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$"))
                throw new Fault("Invalid float text", node.Token);
            return Numbers.Make("float", double.Parse(text, CultureInfo.InvariantCulture), node.Token);
        }
        try
        {
            switch (name)
            {
                case "File.exists":
                    return File.Exists((string)args[0]!) || Directory.Exists((string)args[0]!);
                case "File.readText":
                    return File.ReadAllText((string)args[0]!, Utf8);
                case "File.readLines":
                    return r.Collection("array", "string", Lines(File.ReadAllText((string)args[0]!, Utf8)).Cast<object?>().ToList(), null, node);
                case "File.writeText":
                    Replace((string)args[0]!, (string)args[1]!);
                    return null;
                case "File.appendText":
                    File.AppendAllText((string)args[0]!, (string)args[1]!, Utf8);
                    return null;
                case "File.writeLines":
                    var items = ((Collection)args[1]!).Items;
                    Replace((string)args[0]!, string.Join('\n', items.Cast<string>()) + (items.Count > 0 ? "\n" : ""));
                    return null;
                case "File.open":
                    string mode = (string)args[1]!;
                    if (mode is not ("r" or "w" or "a"))
                        throw Error("File mode must be r, w, or a");
                    var stream = new FileStream((string)args[0]!, mode == "r" ? FileMode.Open : mode == "w" ? FileMode.Create : FileMode.Append, mode == "r" ? FileAccess.Read : FileAccess.Write, FileShare.Read);
                    try
                    {
                        var handle = new Handle(stream, mode);
                        if (mode == "r")
                        {
                            using var reader = new StreamReader(stream, Utf8, true, 1024, true);
                            handle.Lines = Lines(reader.ReadToEnd());
                        }
                        var obj = r.Create("TextFile", [], r.Classes["TextFile"], node);
                        obj.Native = handle;
                        return obj;
                    }
                    catch { stream.Dispose(); throw; }
                default:
                    if (self?.Native is not Handle h)
                        throw Error("Invalid file handle");
                    if (name == "TextFile.isClosed")
                        return h.Closed;
                    if (name == "TextFile.close")
                    {
                        if (!h.Closed)
                        {
                            h.Stream.Dispose();
                            h.Closed = true;
                        }
                        return null;
                    }
                    if (h.Closed)
                        throw Error("File is closed");
                    if (name == "TextFile.readLine")
                    {
                        if (h.Mode != "r")
                            throw Error("File is not open for reading");
                        return h.Position < h.Lines.Count ? h.Lines[h.Position++] : null;
                    }
                    if (h.Mode == "r")
                        throw Error("File is not open for writing");
                    h.Stream.Write(Utf8.GetBytes((string)args[0]! + (name == "TextFile.writeLine" ? "\n" : "")));
                    return null;
            }
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException) { throw Error(error.Message); }
    }
}
