using System.Text;

namespace Kole;

static class Program
{
    static int Main(string[] args)
    {
        Console.Out.NewLine = "\n";
        Console.Error.NewLine = "\n";
        Console.InputEncoding = new UTF8Encoding(false);
        Console.OutputEncoding = new UTF8Encoding(false);
        if (args is ["alex"])
        {
            Console.WriteLine("Every language starts with a name.\nThis one started with Alex Kull.");
            return 0;
        }
        if (args is ["--version"])
        {
            Console.WriteLine("kole 0.10.0 (native C# interpreter)");
            return 0;
        }
        if (args.Length < 2 || args[0] is not ("run" or "check"))
        {
            Console.Error.WriteLine("Usage: kole <run|check> <file.k> [program arguments]");
            return 2;
        }
        try
        {
            var (classes, entry) = Modules.Load(args[1]);
            var runtime = new Runtime(classes);
            new Checker(runtime).Check();
            if (args[0] == "run")
                runtime.Run(entry, args.Skip(2).ToArray());
            else
                Console.WriteLine($"{args[1]}: static checks passed");
            return 0;
        }
        catch (Fault error) { Console.Error.WriteLine($"{(error.At.File == "" ? args[1] : error.At.File)}:{error.At.Line}:{error.At.Column}: {(error is Thrown t ? t.Value.Class.Name + ": " : "")}{error.Message}"); foreach (var frame in error.Frames) Console.Error.WriteLine("  at " + frame); foreach (var suppressed in error.Suppressed) Console.Error.WriteLine("  suppressed: " + suppressed.Message); return 1; }
        catch (Exception error) { Console.Error.WriteLine("kole: internal error: " + error.Message); return 1; }
    }
}
