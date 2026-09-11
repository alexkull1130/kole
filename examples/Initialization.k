class Label {
    private text: string;
    public Label(short: bool) {
        if(short) { me.text = "kole"; }
        else { me.text = "The kole programming language"; }
    }
    public describe() -> string { return text; }
}

class Initialization {
    public static main() -> void {
        label: Label;
        label = new Label(true);
        print(label.describe());
    }
}
