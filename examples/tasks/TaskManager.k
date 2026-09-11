class TaskManager {
    static main(args: string[]) -> void {
        path: string = "tasks.txt";
        if(args.length > 0) { path = args[0]; }
        try {
            store: TaskStore = new TaskStore(path);
            store.load();
            print("kole tasks | add <title>, list, done <number>, remove <number>, quit");
            while(true) {
                Console.write("> ");
                input: string? = Console.readLine();
                if(input == null) { break; }
                command: string = input.trim();
                if(command == "quit") { break; }
                try {
                    if(command == "list") { store.show(); }
                    else if(command.startsWith("add ")) { store.add(command.substring(4, command.length).trim()); }
                    else if(command.startsWith("done ")) { store.complete(Int.parse(command.substring(5, command.length))); }
                    else if(command.startsWith("remove ")) { store.remove(Int.parse(command.substring(7, command.length))); }
                    else { print("Use add <title>, list, done <number>, remove <number>, or quit."); }
                } catch(error: Error) { print("Error: " + error.message); }
            }
        } catch(error: Error) { print("Cannot open tasks: " + error.message); }
    }
}
class Task {
    title: string;
    done: bool;
    Task(title: string, done: bool) { me.title = title; me.done = done; }
}
class TaskStore {
    private path: string;
    private tasks: List<Task> = new List<Task>();
    TaskStore(path: string) { me.path = path; }
    load() -> void {
        if(!File.exists(path)) { return; }
        using(file: TextFile = File.open(path, "r")) {
            while(true) {
                line: string? = file.readLine();
                if(line == null) { break; }
                if(line.length < 3) { throw new Error("Invalid task file"); }
                flag: string = line.substring(0, 2);
                if(flag != "0\t" && flag != "1\t") { throw new Error("Invalid task record"); }
                tasks.add(new Task(line.substring(2, line.length), flag == "1\t"));
            }
        }
    }
    save() -> void {
        lines: List<string> = new List<string>();
        for(i=0:tasks.length:+) {
            prefix: string = "0\t";
            if(tasks[i].done) { prefix = "1\t"; }
            lines.add(prefix + tasks[i].title);
        }
        File.writeLines(path, lines.toArray());
    }
    add(title: string) -> void {
        if(title.isEmpty() || title.contains("\t") || title.contains("\n") || title.contains("\r")) { throw new Error("Enter a nonempty, single-line title without tabs"); }
        tasks.add(new Task(title, false));
        try { save(); } catch(error: Error) { tasks.removeAt(tasks.length - 1); throw error; }
        print("Added.");
    }
    complete(number: int) -> void {
        index: int = number - 1;
        if(index < 0 || index >= tasks.length) { throw new Error("Task number out of range"); }
        previous: bool = tasks[index].done;
        tasks[index].done = true;
        try { save(); } catch(error: Error) { tasks[index].done = previous; throw error; }
        print("Done.");
    }
    remove(number: int) -> void {
        index: int = number - 1;
        if(index < 0 || index >= tasks.length) { throw new Error("Task number out of range"); }
        task: Task = tasks.removeAt(index);
        try { save(); } catch(error: Error) { tasks.insert(index, task); throw error; }
        print("Removed.");
    }
    show() -> void {
        if(tasks.isEmpty()) { print("No tasks yet."); }
        for(i=0:tasks.length:+) {
            mark: string = "[ ]";
            if(tasks[i].done) { mark = "[x]"; }
            print(string(i + 1) + ". " + mark + " " + tasks[i].title);
        }
    }
}
