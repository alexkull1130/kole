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

#ifdef __cplusplus
}
#endif
#endif
