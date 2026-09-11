class Page {
    public belongsTo notebook: Notebook?;
    public text: string;
    public Page(text: string) { me.text = text; }
    public describeOwner() -> void {
        owner: Notebook? = notebook;
        if(owner != null) { print(text, "belongs to", owner.name); }
        else { print(text, "has no owner"); }
    }
}

class Notebook {
    public name: string;
    private owns page: Page? = null;
    public Notebook(name: string) { me.name = name; }
    public attach(page: Page) -> void { me.page = page; }
    public detach() -> void { page = null; }
}

class Relationships {
    public static main() -> void {
        page: Page("Chapter one");
        first: Notebook("Ideas");
        second: Notebook("kole");
        first.attach(page);
        page.describeOwner();
        first.detach();
        second.attach(page);
        page.describeOwner();
    }
}
