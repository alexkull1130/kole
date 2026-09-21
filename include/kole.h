#ifndef KOLE_H
#define KOLE_H
#ifdef __cplusplus
extern "C" {
#endif

/* UTF-8 strings. Returned error text remains valid until the next API call or destroy. */
void* kole_runtime_create(void);
void kole_runtime_destroy(void* runtime);
int kole_runtime_load(void* runtime, const char* source, const char* filename);
int kole_runtime_run(void* runtime, const char* entry_class);
const char* kole_runtime_last_error(void* runtime);

/* Owner-bound callbacks. Closing or destroying the domain cancels all subscriptions. */
typedef void (*kole_callback)(void* context, void* payload);
void* kole_domain_create(void);
void kole_domain_close(void* domain);
void kole_domain_destroy(void* domain);
void* kole_domain_subscribe(void* domain, kole_callback callback, void* context);
void kole_subscription_cancel(void* subscription);
void kole_subscription_destroy(void* subscription);
void kole_domain_publish(void* domain, void* payload);

#ifdef __cplusplus
}
#endif
#endif
