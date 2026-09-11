namespace Kole;

static class Types
{
    public static (string Base, List<string> Args)? Generic(string type)
    {
        int open = type.IndexOf('<');
        if (open < 0 || !type.EndsWith('>'))
            return null;
        var args = new List<string>();
        int depth = 0, start = open + 1;
        for (int i = start; i < type.Length - 1; i++)
        {
            if (type[i] == '<')
                depth++;
            else if (type[i] == '>')
                depth--;
            else if (type[i] == ',' && depth == 0)
            {
                args.Add(type[start..i]);
                start = i + 1;
            }
        }
        args.Add(type[start..^1]);
        return (type[..open], args);
    }
    public static string Map(string type, Func<string, string> resolve)
    {
        if (type.EndsWith('?'))
            return Map(type[..^1], resolve) + "?";
        if (type.EndsWith("[]"))
            return Map(type[..^2], resolve) + "[]";
        var generic = Generic(type);
        return generic is { } g ? $"{resolve(g.Base)}<{string.Join(',', g.Args.Select(x => Map(x, resolve)))}>" : resolve(type);
    }
    public static List<Node> Specialize(List<Node> input)
    {
        var definitions = new Dictionary<string, Node>();
        foreach (var c in input)
        if (!definitions.TryAdd(c.Name, c))
            throw new Fault($"Duplicate class '{c.Name}'", c.Token);
        var templates = definitions.Where(x => x.Value.TypeParams.Count > 0).ToDictionary();
        var instances = new Dictionary<string, Node>();
        var output = new List<Node>();
        int count = 0;
        string Resolve(string type, Dictionary<string, string> bindings, Node node, int depth = 0)
        {
            if (depth > 32)
                throw new Fault("Generic type nesting exceeds 32 levels", node.Token);
            if (type.EndsWith('?'))
                return Resolve(type[..^1], bindings, node, depth + 1) + "?";
            if (type.EndsWith("[]"))
                return Resolve(type[..^2], bindings, node, depth + 1) + "[]";
            if (bindings.TryGetValue(type, out var bound))
                return bound;
            var generic = Generic(type);
            if (generic is { } g)
            {
                var args = g.Args.Select(x => Resolve(x, bindings, node, depth + 1)).ToList();
                if (g.Base == "List")
                {
                    if (args.Count != 1)
                        throw new Fault("List<A> expects one type argument", node.Token);
                    return $"List<{args[0]}>";
                }
                if (!templates.TryGetValue(g.Base, out var template))
                    throw new Fault($"Type '{g.Base}' is not generic", node.Token);
                if (args.Count != template.TypeParams.Count)
                    throw new Fault($"{g.Base} expects {template.TypeParams.Count} type arguments", node.Token);
                string name = $"{g.Base}<{string.Join(',', args)}>";
                if (!instances.ContainsKey(name))
                {
                    if (++count > 256)
                        throw new Fault("Generic specialization limit exceeded", node.Token);
                    var clone = template.Clone();
                    clone.Name = name;
                    clone.TypeParams = [];
                    clone.TypeArguments = args;
                    clone.Aliases = template.Aliases is null ? definitions.Keys.ToDictionary(x => x, x => x) : new(template.Aliases);
                    foreach (var p in template.TypeParams)
                        clone.Aliases.Remove(p);
                    foreach (var arg in args)
                        Map(arg, b => { clone.Aliases["#argument:" + b] = b; return b; });
                    foreach (var alias in clone.Aliases.Keys.ToList())
                    if (clone.Aliases[alias] == g.Base)
                        clone.Aliases[alias] = name;
                    instances[name] = clone;
                    output.Add(clone);
                    Transform(clone, template.TypeParams.Select((p, i) => (p, args[i])).ToDictionary(x => x.p, x => x.Item2));
                }
                return name;
            }
            if (templates.ContainsKey(type))
                throw new Fault($"Generic type '{type}' requires explicit type arguments", node.Token);
            return type;
        }
        void Transform(Node cls, Dictionary<string, string> bindings)
        {
            bindings = new(bindings);
            foreach (var m in cls.Members.Where(x => x.Kind == "enum"))
            {
                if (bindings.ContainsKey(m.Name))
                    throw new Fault("An enum cannot shadow a type parameter", m.Token);
                bindings[m.Name] = cls.Name + "." + m.Name;
            }
            if (cls.Parent != "")
                cls.Parent = Resolve(cls.Parent, bindings, cls);
            var seen = new HashSet<string>();
            for (var ancestor = instances.GetValueOrDefault(cls.Parent) ?? definitions.GetValueOrDefault(cls.Parent); ancestor is not null && seen.Add(ancestor.Name); ancestor = instances.GetValueOrDefault(ancestor.Parent) ?? definitions.GetValueOrDefault(ancestor.Parent))
            foreach (var m in ancestor.Members.Where(x => x.Kind == "enum"))
                bindings.TryAdd(m.Name, ancestor.Name + "." + m.Name);
            void Walk(Node n)
            {
                if (n.Type != "" && !n.Lifecycle)
                    n.Type = Resolve(n.Type, bindings, n);
                if (n.Kind is "new" or "newList")
                    n.Name = Resolve(n.Name, bindings, n);
                foreach (var child in n.Children())
                    Walk(child);
            }
            foreach (var m in cls.Members)
            {
                Walk(m);
                if (m.Constructor)
                    m.Name = cls.Name;
            }
            cls.Interfaces = cls.Interfaces.Select(x => Resolve(x, bindings, cls)).ToList();
        }
        foreach (var template in templates.Values)
        {
            var args = template.TypeParams.Select(p => { string name = $"#{template.Name}:{p}"; output.Add(new("class", template.Token) { Name = name, Abstract = true }); return name; }).ToList();
            Resolve($"{template.Name}<{string.Join(',', args)}>", [], template);
        }
        foreach (var cls in input)
        if (!templates.ContainsKey(cls.Name))
        {
            var clone = cls.Clone();
            output.Add(clone);
            Transform(clone, []);
        }
        return output;
    }
}

static class Modules
{
    sealed class Module(string file, Node program)
    {
        public string File = file; public Node Program = program; public List<(Node Import, Module Dependency)> Dependencies = []; public Dictionary<string, string> Aliases = [];
    }
    public static (List<Node> Classes, string Entry) Load(string entryFile)
    {
        var modules = new Dictionary<string, Module>(OperatingSystem.IsWindows() ? StringComparer.OrdinalIgnoreCase : StringComparer.Ordinal);
        Module Read(string file)
        {
            file = Path.GetFullPath(file);
            if (Path.GetExtension(file) != ".k")
                throw new Fault("Source files must use .k", new("", "", file));
            if (modules.TryGetValue(file, out var found))
                return found;
            try
            {
                var m = new Module(file, Parser.Parse(File.ReadAllText(file), file));
                modules.Add(file, m);
                return m;
            }
            catch (IOException error) { throw new Fault($"Cannot load {file}: {error.Message}", new("", "", file)); }
        }
        var entry = Read(entryFile);
        string root = Path.GetDirectoryName(entry.File)!;
        foreach (var part in entry.Program.Package.Split('.', StringSplitOptions.RemoveEmptyEntries).Reverse())
        {
            if (Path.GetFileName(root) != part)
                throw new Fault("Entry package must match its directory path", new("", "", entry.File));
            root = Path.GetDirectoryName(root)!;
        }
        var visited = new HashSet<Module>();
        void Visit(Module module)
        {
            if (!visited.Add(module))
                return;
            foreach (var import in module.Program.Imports)
            {
                string filename = import.Kind == "file" ? Path.GetFullPath(import.Name, Path.GetDirectoryName(module.File)!) : Path.Combine(root, import.Name.Replace('.', Path.DirectorySeparatorChar)) + ".k";
                Module dep;
                try
                {
                    dep = Read(filename);
                }
                catch (Fault error) { throw new Fault($"Import '{import.Name}': {error.Message}", import.Token); }
                if (import.Kind != "file")
                {
                    var parts = import.Name.Split('.');
                    if (dep.Program.Package != string.Join('.', parts[..^1]) || !dep.Program.Classes.Any(x => x.Name == parts[^1]))
                        throw new Fault($"Import '{import.Name}' does not match the file's package and class", import.Token);
                }
                module.Dependencies.Add((import, dep));
                Visit(dep);
            }
        }
        Visit(entry);
        string Qualify(Module m, string name) => m.Program.Package == "" ? name : m.Program.Package + "." + name;
        var allNames = new HashSet<string>();
        foreach (var m in modules.Values)
        {
            void Add(string name, string qualified, Token at)
            {
                if (!m.Aliases.TryAdd(name, qualified))
                    throw new Fault($"Duplicate or ambiguous imported name '{name}'", at);
            }
            foreach (var cls in m.Program.Classes)
            {
                if (Numbers.Primitives.Contains(cls.Name) || Standard.Names.Contains(cls.Name) || cls.Name is "List" or "void" or "print")
                    throw new Fault($"Reserved class '{cls.Name}'", cls.Token);
                string qualified = Qualify(m, cls.Name);
                if (!allNames.Add(qualified))
                    throw new Fault($"Duplicate class '{qualified}'", cls.Token);
                Add(cls.Name, qualified, cls.Token);
            }
            foreach (var (import, dep) in m.Dependencies)
            {
                var names = import.Kind == "file" ? dep.Program.Classes.Select(x => x.Name) : [import.Name.Split('.').Last()];
                foreach (var name in names)
                    Add(name, Qualify(dep, name), import.Token);
            }
        }
        foreach (var m in modules.Values)
        foreach (var cls in m.Program.Classes)
        {
            var enums = cls.Members.Where(x => x.Kind == "enum").Select(x => x.Name).ToHashSet();
            string Type(string name) => Types.Map(name, b => Numbers.Primitives.Contains(b) || b is "void" or "List" || cls.TypeParams.Contains(b) || enums.Contains(b) ? b : m.Aliases.GetValueOrDefault(b, b));
            void Walk(Node node)
            {
                if (node.Type != "")
                    node.Type = Type(node.Type);
                if (node.Kind is "new" or "newList")
                    node.Name = Type(node.Name);
                foreach (var child in node.Children())
                    Walk(child);
            }
            foreach (var member in cls.Members)
                Walk(member);
            cls.Name = Qualify(m, cls.Name);
            foreach (var member in cls.Members)
            if (member.Constructor)
                member.Name = cls.Name;
            if (cls.Parent != "")
                cls.Parent = Type(cls.Parent);
            cls.Interfaces = cls.Interfaces.Select(Type).ToList();
            cls.Aliases = m.Aliases;
        }
        return (modules.Values.SelectMany(m => m.Program.Classes).ToList(), Qualify(entry, Path.GetFileNameWithoutExtension(entry.File)));
    }
}
