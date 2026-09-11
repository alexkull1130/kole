class Page {
    public belongsTo notebook: Notebook?;
    public text: String;
    public Page(text: String) { me.text = text; }
    public describeOwner() -> void {
        owner: Notebook? = notebook;
        if(owner != null) { print(text, "belongs to", owner.name); }
        else { print(text, "has no owner"); }
    }
}

class Notebook {
    public name: String;
    private owns page: Page? = null;
    public Notebook(name: String) { me.name = name; }
    public attach(page: Page) -> void { me.page = page; }
    public detach() -> void { page = null; }
}

class Relationships {
    public static main() -> void {
        page: Page = new Page("Chapter one");
        first: Notebook = new Notebook("Ideas");
        second: Notebook = new Notebook("kole");
        first.attach(page);
        page.describeOwner();
        first.detach();
        second.attach(page);
        page.describeOwner();
    }
}
