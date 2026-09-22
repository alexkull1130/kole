#include <stdio.h>
#include "../../include/kole.h"

static int callbacks = 0;
static int output_lines = 0;
static int cleaned = 0;
static void on_change(void* context, void* payload) {
    (void)context;
    (void)payload;
    callbacks++;
}
static void on_output(void* context, const char* text) {
    (void)context;
    output_lines++;
    printf("script: %s\n", text);
}
static void on_close(void* context) {
    cleaned++;
    printf("closed: %s\n", (const char*)context);
}

int main(void) {
    if (kole_api_version() != KOLE_API_VERSION) {
        fprintf(stderr, "Incompatible Kole embedding API\n");
        return 2;
    }
    const char* script =
        "class HostDemo {"
        " static main(args: string[]) -> void { Console.writeLine(\"Kole is hosted: \" + args[0]); }"
        "}";
    const char* args[] = { "native-host" };
    void* runtime = kole_runtime_create();
    kole_runtime_set_output(runtime, on_output, NULL);
    if (!kole_runtime_load(runtime, script, "HostDemo.k") || !kole_runtime_run_with_args(runtime, "HostDemo", 1, args)) {
        fprintf(stderr, "Kole error %d: %s\n", kole_runtime_last_error_code(runtime), kole_runtime_last_error(runtime));
        kole_runtime_destroy(runtime);
        return 3;
    }
    kole_runtime_destroy(runtime);
    void* domain = kole_domain_create();
    void* first_close = kole_domain_on_close(domain, on_close, "first");
    void* second_close = kole_domain_on_close(domain, on_close, "second");
    void* subscription = kole_domain_subscribe(domain, on_change, NULL);
    kole_domain_publish(domain, NULL);
    kole_domain_close(domain);
    kole_domain_publish(domain, NULL); /* Safe no-op: the callback cannot outlive its owner. */
    kole_subscription_destroy(subscription);
    kole_close_action_destroy(first_close);
    kole_close_action_destroy(second_close);
    kole_domain_destroy(domain);
    printf("callbacks: %d\n", callbacks);
    return callbacks == 1 && output_lines == 1 && cleaned == 2 ? 0 : 1;
}
