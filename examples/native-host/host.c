#include <stdio.h>
#include "../../include/kole.h"

static int callbacks = 0;
static void on_change(void* context, void* payload) {
    (void)context;
    (void)payload;
    callbacks++;
}

int main(void) {
    void* domain = kole_domain_create();
    void* subscription = kole_domain_subscribe(domain, on_change, NULL);
    kole_domain_publish(domain, NULL);
    kole_domain_close(domain);
    kole_domain_publish(domain, NULL); /* Safe no-op: the callback cannot outlive its owner. */
    kole_subscription_destroy(subscription);
    kole_domain_destroy(domain);
    printf("callbacks: %d\n", callbacks);
    return callbacks == 1 ? 0 : 1;
}
