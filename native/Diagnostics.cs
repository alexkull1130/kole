using System.Text.Json;
using System.Text.RegularExpressions;

namespace Kole;

static class Diagnostics
{
    static readonly List<(Regex Pattern, string Hint)> Rules = Load();
    static List<(Regex, string)> Load()
    {
        using var stream = typeof(Diagnostics).Assembly.GetManifestResourceStream("diagnostics.json")!;
        using var document = JsonDocument.Parse(stream);
        return document.RootElement.EnumerateArray().Select(rule => (
            new Regex(rule.GetProperty("pattern").GetString()!, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant),
            rule.GetProperty("hint").GetString()!)).ToList();
    }
    public static void Print(Fault error, string fallback)
    {
        string file = error.At.File == "" ? fallback : error.At.File;
        try
        {
            var lines = File.ReadAllLines(file);
            if (error.At.Line > 0 && error.At.Line <= lines.Length)
            {
                string text = lines[error.At.Line - 1];
                int column = Math.Clamp(error.At.Column - 1, 0, text.Length);
                Console.Error.WriteLine("  " + text.Replace("\t", "    "));
                Console.Error.WriteLine("  " + new string(' ', text[..column].Replace("\t", "    ").Length) + "^");
            }
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
        var hint = Rules.FirstOrDefault(rule => rule.Pattern.IsMatch(error.Message)).Hint;
        if (hint is not null)
            Console.Error.WriteLine("  hint: " + hint);
    }
}
