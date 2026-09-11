using System.Text;
using System.Text.RegularExpressions;

namespace Kole;

sealed record Token(string Kind, string Text, string File = "", int Line = 1, int Column = 1);
class Fault(string message, Token? token = null) : Exception(message)
{
    public Token At = token ?? new("", "");
    public bool Fatal;
    public List<string> Frames = [];
    public List<Exception> Suppressed = [];
}
sealed class Node(string kind = "", Token? token = null)
{
    public string Kind = kind, Name = "", Type = "", Op = "", Access = "public", Parent = "", From = "", To = "", Relationship = "", Native = "", ResolvedElementType = "", Package = "";
    public Token Token = token ?? new("", "");
    public bool Static, Abstract, Override, Constructor, Interface, Lifecycle;
    public int Step;
    public object? Value;
    public Node? Left, Right, Object, Index, Body, Condition, Yes, No, Start, End, Init, Finalizer, Callee;
    public List<Node> Members = [], Params = [], Args = [], Statements = [], Items = [], Catches = [], Classes = [], Imports = [];
    public List<string> Interfaces = [], TypeParams = [], Values = [], TypeArguments = [];
    public Dictionary<string, string>? Aliases;
    public Class? Owner;
    public string? Inverse;
    public Node Clone()
    {
        var n = (Node)MemberwiseClone();
        n.Left = Left?.Clone();
        n.Right = Right?.Clone();
        n.Object = Object?.Clone();
        n.Index = Index?.Clone();
        n.Body = Body?.Clone();
        n.Condition = Condition?.Clone();
        n.Yes = Yes?.Clone();
        n.No = No?.Clone();
        n.Start = Start?.Clone();
        n.End = End?.Clone();
        n.Init = Init?.Clone();
        n.Finalizer = Finalizer?.Clone();
        n.Callee = Callee?.Clone();
        if (Value is Node v)
            n.Value = v.Clone();
        n.Members = Members.Select(x => x.Clone()).ToList();
        n.Params = Params.Select(x => x.Clone()).ToList();
        n.Args = Args.Select(x => x.Clone()).ToList();
        n.Statements = Statements.Select(x => x.Clone()).ToList();
        n.Items = Items.Select(x => x.Clone()).ToList();
        n.Catches = Catches.Select(x => x.Clone()).ToList();
        n.Interfaces = [.. Interfaces];
        n.TypeParams = [.. TypeParams];
        n.TypeArguments = [.. TypeArguments];
        n.Values = [.. Values];
        n.Aliases = Aliases is null ? null : new(Aliases);
        return n;
    }
    public IEnumerable<Node> Children()
    {
        foreach (var n in new[] { Left, Right, Object, Index, Body, Condition, Yes, No, Start, End, Init, Finalizer, Callee, Value as Node })
        if (n is not null)
            yield return n;
        foreach (var list in new[] { Members, Params, Args, Statements, Items, Catches })
        foreach (var n in list)
            yield return n;
    }
}

static class Lexer
{
    public static List<Token> Scan(string source, string file = "")
    {
        var tokens = new List<Token>();
        int pos = 0, line = 1, column = 1;
        char Peek(int n = 0) => pos + n < source.Length ? source[pos + n] : '\0';
        char Take()
        {
            char c = source[pos++];
            if (c == '\n')
            {
                line++;
                column = 1;
            }
            else
                column++;
            return c;
        }
        while (pos < source.Length)
        {
            char c = Peek();
            if (char.IsWhiteSpace(c) || c == '\uFEFF')
            {
                Take();
                continue;
            }
            var at = new Token("", "", file, line, column);
            if (c == '/' && Peek(1) == '/')
            {
                while (pos < source.Length && Peek() != '\n')
                    Take();
                continue;
            }
            if (c == '/' && Peek(1) == '*')
            {
                Take();
                Take();
                while (pos < source.Length && !(Peek() == '*' && Peek(1) == '/'))
                    Take();
                if (pos == source.Length)
                    throw new Fault("Unclosed comment", at);
                Take();
                Take();
                continue;
            }
            if (c == '"' || c == '\'')
            {
                char quote = Take();
                var text = new StringBuilder();
                bool closed = false;
                while (pos < source.Length)
                {
                    char x = Take();
                    if (x == quote)
                    {
                        closed = true;
                        break;
                    }
                    if (x == '\n' || x == '\r')
                        throw new Fault("Unclosed literal", at);
                    if (x == '\\')
                    {
                        if (pos == source.Length)
                            throw new Fault("Unclosed escape", at);
                        x = Take();
                        if (x == 'u')
                        {
                            if (Take() != '{')
                                throw new Fault("Expected Unicode scalar escape", at);
                            var hex = new StringBuilder();
                            while (pos < source.Length && Peek() != '}')
                                hex.Append(Take());
                            if (pos == source.Length || !int.TryParse(hex.ToString(), System.Globalization.NumberStyles.HexNumber, null, out int cp) || !Rune.IsValid(cp))
                                throw new Fault("Invalid Unicode scalar", at);
                            Take();
                            text.Append(new Rune(cp).ToString());
                            continue;
                        }
                        x = x switch
                        {
                            'n' => '\n',
                            'r' => '\r',
                            't' => '\t',
                            '0' => '\0',
                            '\\' => '\\',
                            '\'' => '\'',
                            '"' => '"',
                            _ => throw new Fault("Unknown escape", at)
                        };
                    }
                    text.Append(x);
                }
                if (!closed)
                    throw new Fault("Unclosed literal", at);
                tokens.Add(at with
                {
                    Kind = quote == '"' ? "string" : "char",
                    Text = text.ToString()
                });
                continue;
            }
            if (char.IsAsciiDigit(c))
            {
                int start = pos;
                while (char.IsAsciiDigit(Peek()))
                    Take();
                if (Peek() == '.' && char.IsAsciiDigit(Peek(1)))
                {
                    Take();
                    while (char.IsAsciiDigit(Peek()))
                        Take();
                }
                if (Peek() is 'e' or 'E')
                {
                    Take();
                    if (Peek() is '+' or '-')
                        Take();
                    if (!char.IsAsciiDigit(Peek()))
                        throw new Fault("Invalid exponent", at);
                    while (char.IsAsciiDigit(Peek()))
                        Take();
                }
                if (Peek() is 'f' or 'F' or 'l' or 'L')
                    Take();
                tokens.Add(at with
                {
                    Kind = "number",
                    Text = source[start..pos]
                });
                continue;
            }
            if (char.IsAsciiLetter(c) || c == '_')
            {
                int start = pos;
                while (char.IsAsciiLetterOrDigit(Peek()) || Peek() == '_')
                    Take();
                tokens.Add(at with
                {
                    Kind = "identifier",
                    Text = source[start..pos]
                });
                continue;
            }
            string pair = pos + 1 < source.Length ? source.Substring(pos, 2) : "";
            if (new[] { "->", "==", "!=", "<=", ">=", "&&", "||", "+=", "-=", "++", "--" }.Contains(pair))
            {
                Take();
                Take();
                tokens.Add(at with
                {
                    Kind = "symbol",
                    Text = pair
                });
                continue;
            }
            if ("{}()[];:,.?+-*/%=!<>".Contains(c))
            {
                Take();
                tokens.Add(at with
                {
                    Kind = "symbol",
                    Text = c.ToString()
                });
                continue;
            }
            throw new Fault($"Unexpected character '{c}'", at);
        }
        tokens.Add(new("eof", "<eof>", file, line, column));
        return tokens;
    }
}

sealed class Parser(List<Token> tokens)
{
    int pos, loops;
    static readonly HashSet<string> Reserved = ["try", "catch", "finally", "throw", "using", "package", "import", "extends", "override", "abstract", "super", "class", "interface", "implements", "public", "private", "static", "enum", "state", "requires", "transitions", "require", "if", "else", "while", "for", "return", "break", "continue", "new", "me", "this", "true", "false", "null", "owns", "belongsTo", "atomic"];
    static readonly Dictionary<string, int> Ranks = new() { ["="] = 1, ["+="] = 1, ["-="] = 1, ["||"] = 2, ["&&"] = 3, ["=="] = 4, ["!="] = 4, ["<"] = 5, [">"] = 5, ["<="] = 5, [">="] = 5, ["+"] = 6, ["-"] = 6, ["*"] = 7, ["/"] = 7, ["%"] = 7 };
    Token Peek(int n = 0) => tokens[Math.Min(pos + n, tokens.Count - 1)];
    bool At(string text) => Peek().Text == text && Peek().Kind is not ("string" or "char");
    Token Take() => tokens[pos++];
    bool Match(string text)
    {
        if (!At(text))
            return false;
        Take();
        return true;
    }
    Token Expect(string text)
    {
        if (!At(text))
            throw new Fault($"Expected '{text}', found '{Peek().Text}'", Peek());
        return Take();
    }
    string Name()
    {
        if (Peek().Kind != "identifier" || Reserved.Contains(Peek().Text))
            throw new Fault("Expected an identifier", Peek());
        return Take().Text;
    }
    string Qualified()
    {
        string name = Name();
        while (Match("."))
            name += "." + Name();
        return name;
    }
    public static Node Parse(string text, string file = "") => new Parser(Lexer.Scan(text, file)).Program();
    string Type()
    {
        string type = Name();
        if (new[] { "boolean", "String", "double" }.Contains(type))
            throw new Fault($"Use '{(type == "boolean" ? "bool" : type == "String" ? "string" : "float")}' instead of '{type}'", Peek());
        if (Match("<"))
        {
            type += "<" + Type();
            while (Match(","))
                type += "," + Type();
            if (At(">="))
            {
                var t = Take();
                tokens.Insert(pos, t with
                {
                    Text = "=",
                    Column = t.Column + 1
                });
            }
            else
                Expect(">");
            type += ">";
        }
        while (true)
        {
            if (At("[") && Peek(1).Text == "]")
            {
                Take();
                Take();
                type += "[]";
            }
            else if (Match("?"))
            {
                if (type.EndsWith('?'))
                    throw new Fault("Repeated nullable marker", Peek());
                type += "?";
            }
            else
                break;
        }
        return type;
    }
    Node Modifiers()
    {
        var n = new Node();
        var seen = new HashSet<string>();
        while (new[] { "public", "private", "static", "abstract", "override" }.Any(At))
        {
            var t = Take();
            if (!seen.Add(t.Text) || (t.Text is "public" or "private" && seen.Contains(t.Text == "public" ? "private" : "public")))
                throw new Fault("Conflicting modifier", t);
            switch (t.Text)
            {
                case "static":
                    n.Static = true;
                    break;
                case "abstract":
                    n.Abstract = true;
                    break;
                case "override":
                    n.Override = true;
                    break;
                default:
                    n.Access = t.Text;
                    break;
            }
        }
        return n;
    }
    Node Program()
    {
        var p = new Node("program");
        if (Match("package"))
        {
            p.Package = Qualified();
            Expect(";");
        } while (Match("import"))
        {
            var at = Peek();
            bool file = at.Kind == "string";
            p.Imports.Add(new(file ? "file" : "import", at)
            {
                Name = file ? Take().Text : Qualified()
            });
            Expect(";");
        } while (Peek().Kind != "eof")
            p.Classes.Add(ClassDecl());
        if (p.Classes.Count == 0)
            throw new Fault("Expected a class", Peek());
        return p;
    }
    Node ClassDecl()
    {
        var n = new Node("class", Peek());
        Match("public");
        n.Abstract = Match("abstract");
        n.Interface = Match("interface");
        if (!n.Interface)
            Expect("class");
        n.Name = Name();
        if (Match("<"))
        {
            do
            {
                string param = Name();
                if (n.TypeParams.Contains(param) || Numbers.Primitives.Contains(param) || param == n.Name || param is "List" or "void")
                    throw new Fault("Duplicate or reserved type parameter", Peek());
                n.TypeParams.Add(param);
            } while (Match(","));
            Expect(">");
        }
        if (!n.Interface && Match("extends"))
            n.Parent = Type();
        if (!n.Interface && Match("implements"))
        {
            do
            {
                n.Interfaces.Add(Type());
            } while (Match(","));
        }
        Expect("{");
        while (!At("}"))
        {
            var t = Peek();
            var m = Modifiers();
            m.Token = t;
            if (Match("enum"))
            {
                if (n.Interface || m.Abstract || m.Override)
                    throw new Fault("Invalid enum declaration", t);
                m.Kind = "enum";
                m.Name = Name();
                Expect("{");
                do
                {
                    m.Values.Add(Name());
                } while (Match(",") && !At("}"));
                Expect("}");
                Match(";");
                n.Members.Add(m);
                continue;
            }
            m.Lifecycle = Match("state");
            m.Relationship = Match("owns") ? "owns" : Match("belongsTo") ? "belongsTo" : "";
            if (m.Lifecycle && m.Relationship != "")
                throw new Fault("Invalid lifecycle relationship", t);
            bool modern = Peek(1).Text is ":" or "(";
            if (modern)
            {
                m.Name = Name();
                if (Match(":"))
                    m.Type = Type();
                else if (m.Name == n.Name)
                {
                    m.Constructor = true;
                    m.Type = "void";
                }
            }
            else
            {
                m.Type = Type();
                m.Name = Name();
            }
            if (!(modern && m.Type != "" && !m.Constructor) && Match("("))
            {
                m.Kind = "method";
                if (modern && m.Type != "" && !m.Constructor)
                    throw new Fault("Methods use return arrows", t);
                if (m.Lifecycle || m.Relationship != "")
                    throw new Fault("Relationship modifiers apply to fields", t);
                if (!At(")"))
                {
                    do
                    {
                        var param = new Node("parameter", Peek());
                        if (Peek(1).Text == ":")
                        {
                            param.Name = Name();
                            Expect(":");
                            param.Type = Type();
                        }
                        else
                        {
                            param.Type = Type();
                            param.Name = Name();
                        }
                        m.Params.Add(param);
                    } while (Match(","));
                }
                Expect(")");
                if (modern && !m.Constructor)
                {
                    Expect("->");
                    m.Type = Type();
                }
                if (Match("requires"))
                    m.From = Name();
                else if (Match("transitions"))
                {
                    m.From = Name();
                    Expect("->");
                    m.To = Name();
                }
                if (m.To != "" && m.Type != "void" || m.From != "" && (m.Static || m.Constructor) || m.Constructor && m.Static)
                    throw new Fault("Invalid lifecycle or constructor modifiers", t);
                if (n.Interface)
                {
                    if (m.Constructor || m.Static || m.Access != "public" || m.From != "")
                        throw new Fault("Invalid interface signature", t);
                    Expect(";");
                }
                else if (m.Abstract)
                {
                    if (!n.Abstract || m.Constructor || m.Static || m.Access == "private")
                        throw new Fault("Abstract methods require an abstract class", t);
                    Expect(";");
                }
                else
                    m.Body = Block();
            }
            else
            {
                m.Kind = "field";
                if (n.Interface || m.Static || m.Abstract || m.Override)
                    throw new Fault("Invalid field declaration", t);
                if (At("("))
                    m.Init = Construct(m.Type, t);
                else if (Match("="))
                    m.Init = Expression();
                Expect(";");
            }
            n.Members.Add(m);
        }
        Expect("}");
        return n;
    }
    Node Block()
    {
        var n = new Node("block", Expect("{"));
        while (!At("}"))
        {
            if (Peek().Kind == "eof")
                throw new Fault("Unclosed block", n.Token);
            n.Statements.Add(Statement());
        }
        Expect("}");
        return n;
    }
    Node Statement()
    {
        var t = Peek();
        if (At("{"))
            return Block();
        if (Match("throw"))
        {
            var n = new Node("throw", t) { Value = Expression() };
            Expect(";");
            return n;
        }
        if (Match("try"))
        {
            var n = new Node("try", t) { Body = Block() };
            while (Match("catch"))
            {
                var h = new Node("catch", Expect("(")) { Name = Name() };
                Expect(":");
                h.Type = Type();
                Expect(")");
                h.Body = Block();
                n.Catches.Add(h);
            }
            if (Match("finally"))
                n.Finalizer = Block();
            if (n.Catches.Count == 0 && n.Finalizer is null)
                throw new Fault("try requires catch or finally", t);
            return n;
        }
        if (Match("using"))
        {
            Expect("(");
            var n = new Node("using", t) { Name = Name() };
            Expect(":");
            n.Type = Type();
            Expect("=");
            n.Value = Expression();
            Expect(")");
            n.Body = Block();
            return n;
        }
        if (At("super") && Peek(1).Text == "(")
        {
            Take();
            Take();
            var n = new Node("superCall", t) { Args = Arguments() };
            Expect(";");
            return n;
        }
        if (Match("for"))
        {
            Expect("(");
            var n = new Node("for", t) { Name = Name() };
            Expect("=");
            n.Start = Expression();
            Expect(":");
            n.End = Expression();
            Expect(":");
            n.Step = Match("+") ? 1 : Match("-") ? -1 : throw new Fault("Expected loop step", Peek());
            Expect(")");
            loops++;
            n.Body = Block();
            loops--;
            return n;
        }
        if (Match("while"))
        {
            Expect("(");
            var n = new Node("while", t) { Condition = Expression() };
            Expect(")");
            loops++;
            n.Body = Block();
            loops--;
            return n;
        }
        if (Match("if"))
        {
            Expect("(");
            var n = new Node("if", t) { Condition = Expression() };
            Expect(")");
            n.Yes = Block();
            if (Match("else"))
                n.No = Statement();
            return n;
        }
        if (Match("return"))
        {
            var n = new Node("return", t);
            if (!At(";"))
                n.Value = Expression();
            Expect(";");
            return n;
        }
        if (At("break") || At("continue"))
        {
            if (loops == 0)
                throw new Fault("Loop control requires a loop", t);
            Take();
            Expect(";");
            return new(t.Text, t);
        }
        if (Match("require"))
        {
            var n = new Node("require", t) { Condition = Expression() };
            Expect(";");
            return n;
        }
        if (t.Kind == "identifier" && !Reserved.Contains(t.Text) && Peek(1).Text == ":")
        {
            var n = new Node("declare", t) { Name = Name() };
            Expect(":");
            n.Type = Type();
            if (At("("))
                n.Value = Construct(n.Type, t);
            else if (Match("="))
                n.Value = Expression();
            Expect(";");
            return n;
        }
        int look = 1;
        while (true)
        {
            if (Peek(look).Text == "[" && Peek(look + 1).Text == "]")
                look += 2;
            else if (Peek(look).Text == "?")
                look++;
            else
                break;
        }
        if (t.Kind == "identifier" && !Reserved.Contains(t.Text) && Peek(look).Kind == "identifier")
        {
            var n = new Node("declare", t) { Type = Type(), Name = Name() };
            if (Match("="))
                n.Value = Expression();
            Expect(";");
            return n;
        }
        var expr = new Node("expression", t) { Value = Expression() };
        Expect(";");
        return expr;
    }
    Node Expression(int min = 1)
    {
        var left = Unary();
        while (Peek().Kind == "symbol" && Ranks.GetValueOrDefault(Peek().Text) >= min)
        {
            var t = Take();
            int rank = Ranks[t.Text];
            var right = Expression(rank == 1 ? rank : rank + 1);
            if (rank == 1 && left.Kind is not ("name" or "member" or "index"))
                throw new Fault("Invalid assignment target", t);
            left = new(rank == 1 ? "assign" : "binary", t)
            {
                Op = t.Text,
                Left = left,
                Right = right
            };
        }
        return left;
    }
    Node Unary()
    {
        if (new[] { "!", "-", "+" }.Any(At))
        {
            var t = Take();
            if (t.Text != "!" && Peek().Kind == "number")
                return new("literal", t)
                {
                    Value = Numbers.Literal(t.Text + Take().Text, t)
                };
            return new("unary", t)
            {
                Op = t.Text,
                Value = Unary()
            };
        }
        var value = Primary();
        while (true)
        {
            var t = Peek();
            if (Match("."))
                value = new("member", t)
                {
                    Object = value,
                    Name = Name()
                };
            else if (Match("("))
                value = new("call", t)
                {
                    Callee = value,
                    Args = Arguments()
                };
            else if (Match("["))
            {
                var index = Expression();
                Expect("]");
                value = new("index", t)
                {
                    Object = value,
                    Index = index
                };
            }
            else if (Match("++") || Match("--"))
            {
                if (value.Kind is not ("name" or "member" or "index"))
                    throw new Fault("Invalid update target", t);
                value = new("update", t)
                {
                    Value = value,
                    Step = t.Text == "++" ? 1 : -1
                };
            }
            else
                break;
        }
        return value;
    }
    List<Node> Arguments()
    {
        var args = new List<Node>();
        if (!At(")"))
        {
            do
            {
                args.Add(Expression());
            } while (Match(","));
        }
        Expect(")");
        return args;
    }
    Node Construct(string name, Token token)
    {
        Expect("(");
        return new(name.StartsWith("List<") && name.EndsWith('>') ? "newList" : "new", token) { Name = name, Args = Arguments() };
    }
    Node Primary()
    {
        var t = Peek();
        if (t.Kind == "number")
        {
            Take();
            return new("literal", t)
            {
                Value = Numbers.Literal(t.Text, t)
            };
        }
        if (t.Kind is "string" or "char")
        {
            Take();
            return new("literal", t)
            {
                Value = t.Kind == "string" ? t.Text : Numbers.Character(t.Text, t)
            };
        }
        if (Match("true"))
            return new("literal", t)
            {
                Value = true
            };
        if (Match("false"))
            return new("literal", t)
            {
                Value = false
            };
        if (Match("null"))
            return new("literal", t);
        if (Match("new"))
        {
            string name = Type();
            if (Match("["))
            {
                var size = Expression();
                Expect("]");
                return new("newArray", t)
                {
                    Type = name,
                    Value = size
                };
            }
            Expect("(");
            return new(name.StartsWith("List<") && name.EndsWith('>') ? "newList" : "new", t)
            {
                Name = name,
                Args = Arguments()
            };
        }
        if (Match("["))
        {
            var n = new Node("array", t);
            if (!At("]"))
            {
                do
                {
                    n.Items.Add(Expression());
                } while (Match(",") && !At("]"));
            }
            Expect("]");
            return n;
        }
        if (Match("("))
        {
            var n = Expression();
            Expect(")");
            return n;
        }
        if (Match("me") || Match("super"))
            return new("name", t)
            {
                Name = t.Text
            };
        if (At("this"))
            throw new Fault("Use 'me' for the current object in kole", t);
        if (t.Kind == "identifier" && Peek(1).Text == "<")
        {
            int saved = pos;
            var original = tokens.ToList();
            string? name = null;
            try { name = Type(); } catch (Fault) { }
            if (name is not null && At("(")) return Construct(name, t);
            pos = saved; tokens.Clear(); tokens.AddRange(original);
        }
        if (t.Kind == "identifier")
            return new("name", t)
            {
                Name = Name()
            };
        throw new Fault($"Expected expression, found '{t.Text}'", t);
    }
}
