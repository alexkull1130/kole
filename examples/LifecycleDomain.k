class Resource implements Closeable {
    name: string;
    closed: bool = false;
    Resource(name: string) { me.name = name; }
    close() -> void {
        if(closed) { return; }
        closed = true;
        print("closed " + name);
    }
}
class Project implements Closeable {
    watcher: Resource;
    worker: Resource;
    closed: bool = false;
    Project() {
        me.watcher = Resource("watcher");
        me.worker = Resource("worker");
    }
    close() -> void {
        if(closed) { return; }
        closed = true;
        // The owner closes dependents in reverse acquisition order.
        worker.close();
        watcher.close();
    }
}
class LifecycleDomain {
    static main() -> void {
        project: Project();
        project.close();
        project.close();
        print("domain closed");
    }
}
