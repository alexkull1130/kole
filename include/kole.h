#ifndef KOLE_H
#define KOLE_H
#ifdef __cplusplus
extern "C" {
#endif

#define KOLE_API_VERSION 3

/* UTF-8 strings. Returned error text remains valid until the next API call or destroy. */
int kole_api_version(void);
typedef enum kole_error_code {
    KOLE_ERROR_NONE = 0,
    KOLE_ERROR_PROGRAM = 1,
    KOLE_ERROR_INTERNAL = 2,
    KOLE_ERROR_INVALID_HANDLE = 3
} kole_error_code;
void* kole_runtime_create(void);
void kole_runtime_destroy(void* runtime);
/* Receives UTF-8 lines while a loaded script runs. Pass NULL to use process stdout. */
typedef void (*kole_output)(void* context, const char* text);
void kole_runtime_set_output(void* runtime, kole_output callback, void* context);
int kole_runtime_load(void* runtime, const char* source, const char* filename);
int kole_runtime_run(void* runtime, const char* entry_class);
int kole_runtime_run_with_args(void* runtime, const char* entry_class, int argc, const char* const* argv);
/* Invoke a public static method with exactly one string parameter and a void return.
   Returns zero and sets the runtime error on failure. */
int kole_runtime_call_string(void* runtime, const char* class_name, const char* method_name, const char* value);
/* Bind a declared static native method with one string parameter and void return.
   The borrowed UTF-8 value is valid only while the callback runs. Return nonzero on success.
   Bind after load and before invoking the method. Bindings are cleared by the next load. */
typedef int (*kole_native_string_void)(void* context, const char* value);
int kole_runtime_bind_string_void(void* runtime, const char* class_name, const char* method_name,
                                  kole_native_string_void callback, void* context);
const char* kole_runtime_last_error(void* runtime);
int kole_runtime_last_error_code(void* runtime);

/* Owner-bound callbacks. Closing or destroying the domain cancels all subscriptions. */
typedef void (*kole_callback)(void* context, void* payload);
void* kole_domain_create(void);
/* Closes the old domain and returns a fresh replacement domain. */
void* kole_domain_replace(void* domain);
void kole_domain_close(void* domain);
void kole_domain_destroy(void* domain);
void* kole_domain_subscribe(void* domain, kole_callback callback, void* context);
void kole_subscription_cancel(void* subscription);
void kole_subscription_destroy(void* subscription);
void kole_domain_publish(void* domain, void* payload);

/* Resource finalizers run once, in reverse registration order, when the domain closes. */
typedef void (*kole_close_action)(void* context);
void* kole_domain_on_close(void* domain, kole_close_action callback, void* context);
void kole_close_action_cancel(void* action);
void kole_close_action_destroy(void* action);

/* Structured host tasks. Work is polled by the owner and returns nonzero when complete. */
typedef int (*kole_task_work)(void* context);
void* kole_domain_start_task(void* domain, kole_task_work work, void* context);
void kole_domain_poll(void* domain);
void kole_task_cancel(void* task);
void kole_task_destroy(void* task);

#ifdef __cplusplus
}
#endif
#endif
