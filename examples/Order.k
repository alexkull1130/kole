class Customer {
    public name: string;
    public Customer(name: string) { me.name = name; }
}

public class Order {
    public enum State { DRAFT, PLACED, SHIPPED }
    private state status: State = DRAFT;
    // Ordinary reference for now; ownership relationships are not implemented.
    private customer: Customer;
    private itemCount: int = 0;

    public Order(customer: Customer) { me.customer = customer; }
    public addItem() -> void requires DRAFT { itemCount += 1; }
    public place() -> void transitions DRAFT -> PLACED {
        require itemCount > 0;
        print("Placed order for", customer.name, "with", itemCount, "items");
    }
    public ship() -> void transitions PLACED -> SHIPPED { print("Shipped"); }

    public static main() -> void {
        order: Order(Customer("Alex"));
        for(i=0:3:+) { order.addItem(); }
        order.place();
        order.ship();
    }
}
