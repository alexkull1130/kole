class Label {
    private text: String;
    public Label(short: boolean) {
        if(short) { me.text = "kole"; }
        else { me.text = "The kole programming language"; }
    }
    public describe() -> String { return text; }
}

class Initialization {
    public static main() -> void {
        label: Label;
        label = new Label(true);
        print(label.describe());
    }
}
