#include <stdio.h>
#include <string.h>
#include <windows.h>
#include "../../include/kole.h"

typedef int (__cdecl *api_fn)(void);
typedef void* (__cdecl *create_fn)(void);
typedef void (__cdecl *destroy_fn)(void*);
typedef void (__cdecl *output_fn)(void*, kole_output, void*);
typedef int (__cdecl *load_fn)(void*, const char*, const char*);
typedef int (__cdecl *run_fn)(void*, const char*, int, const char* const*);
typedef int (__cdecl *call_string_fn)(void*, const char*, const char*, const char*);
typedef int (__cdecl *bind_fn)(void*, const char*, const char*, kole_native_string_void, void*);
typedef int (__cdecl *code_fn)(void*);
typedef const char* (__cdecl *error_fn)(void*);
typedef void* (__cdecl *subscribe_fn)(void*, kole_callback, void*);
typedef void* (__cdecl *on_close_fn)(void*, kole_close_action, void*);
typedef void* (__cdecl *replace_fn)(void*);
typedef void (__cdecl *publish_fn)(void*, void*);

typedef struct FileWatcher {
  char path[MAX_PATH];
  char previous[256];
  void* domain;
  void* subscription;
  void* close_action;
  int closed;
} FileWatcher;

typedef struct Host {
  void* runtime;
  void* domain;
  FileWatcher* watcher;
  subscribe_fn subscribe;
  on_close_fn on_close;
  call_string_fn call_string;
  code_fn error_code;
  error_fn error;
  int callback_failed;
  int output_lines;
  int output_mismatch;
} Host;

static void output(void* context, const char* text) {
  Host* host = (Host*)context;
  const char* expected[] = {
    "Kole is hosted: native-host",
    "changed: native-host-watch.txt",
    "changed: native-host-watch.txt"
  };
  if (host->output_lines >= 3 || strcmp(text, expected[host->output_lines]) != 0)
    host->output_mismatch = 1;
  host->output_lines++;
  printf("script: %s\n", text);
}

static void changed(void* context, void* payload) {
  Host* host = (Host*)context;
  if (!host->call_string(host->runtime, "HostDemo", "onChanged", (const char*)payload)) {
    fprintf(stderr, "Kole callback error %d: %s\n", host->error_code(host->runtime), host->error(host->runtime));
    host->callback_failed = 1;
  }
}

static void watcher_close(void* context) { ((FileWatcher*)context)->closed = 1; }

static int write_contents(const char* path, const char* content) {
  FILE* file = NULL;
  if (fopen_s(&file, path, "wb") != 0) return 0;
  int ok = fputs(content, file) >= 0;
  return fclose(file) == 0 && ok;
}

static int read_contents(const char* path, char* content, size_t capacity) {
  FILE* file = NULL;
  if (fopen_s(&file, path, "rb") != 0) return 0;
  size_t count = fread(content, 1, capacity - 1, file);
  if (ferror(file) || (!feof(file) && count == capacity - 1)) { fclose(file); return 0; }
  content[count] = '\0';
  return fclose(file) == 0;
}

static int watcher_start(FileWatcher* watcher, const char* path, void* domain,
                         subscribe_fn subscribe, on_close_fn on_close, Host* host) {
  memset(watcher, 0, sizeof(*watcher));
  if (strcpy_s(watcher->path, sizeof(watcher->path), path) != 0 ||
      !read_contents(path, watcher->previous, sizeof(watcher->previous))) return 0;
  watcher->domain = domain;
  watcher->subscription = subscribe(domain, changed, host);
  if (!watcher->subscription) return 0;
  watcher->close_action = on_close(domain, watcher_close, watcher);
  return watcher->close_action != NULL;
}

static int native_start(void* context, const char* path) {
  Host* host = (Host*)context;
  if (!host->watcher || !host->domain || host->watcher->subscription) return 0;
  return watcher_start(host->watcher, path, host->domain,
                       host->subscribe, host->on_close, host);
}

static int watcher_poll(FileWatcher* watcher, publish_fn publish) {
  char current[256];
  if (watcher->closed) return 1;
  if (!read_contents(watcher->path, current, sizeof(current))) return 0;
  if (strcmp(current, watcher->previous) != 0) {
    strcpy_s(watcher->previous, sizeof(watcher->previous), current);
    publish(watcher->domain, watcher->path);
  }
  return 1;
}

int main(void) {
  HMODULE dll = LoadLibraryA("kole_embedding.dll");
  if (!dll) return 5;
  api_fn version = (api_fn)GetProcAddress(dll, "kole_api_version");
  create_fn create = (create_fn)GetProcAddress(dll, "kole_runtime_create");
  destroy_fn destroy = (destroy_fn)GetProcAddress(dll, "kole_runtime_destroy");
  output_fn set_output = (output_fn)GetProcAddress(dll, "kole_runtime_set_output");
  load_fn load = (load_fn)GetProcAddress(dll, "kole_runtime_load");
  run_fn run = (run_fn)GetProcAddress(dll, "kole_runtime_run_with_args");
  call_string_fn call_string = (call_string_fn)GetProcAddress(dll, "kole_runtime_call_string");
  bind_fn bind = (bind_fn)GetProcAddress(dll, "kole_runtime_bind_string_void");
  code_fn code = (code_fn)GetProcAddress(dll, "kole_runtime_last_error_code");
  error_fn error = (error_fn)GetProcAddress(dll, "kole_runtime_last_error");
  create_fn domain_create = (create_fn)GetProcAddress(dll, "kole_domain_create");
  replace_fn domain_replace = (replace_fn)GetProcAddress(dll, "kole_domain_replace");
  destroy_fn domain_destroy = (destroy_fn)GetProcAddress(dll, "kole_domain_destroy");
  subscribe_fn subscribe = (subscribe_fn)GetProcAddress(dll, "kole_domain_subscribe");
  destroy_fn subscription_destroy = (destroy_fn)GetProcAddress(dll, "kole_subscription_destroy");
  on_close_fn on_close = (on_close_fn)GetProcAddress(dll, "kole_domain_on_close");
  destroy_fn close_action_destroy = (destroy_fn)GetProcAddress(dll, "kole_close_action_destroy");
  publish_fn publish = (publish_fn)GetProcAddress(dll, "kole_domain_publish");
  if (!version || !create || !destroy || !set_output || !load || !run || !call_string || !bind ||
      !code || !error || !domain_create || !domain_replace || !domain_destroy ||
      !subscribe || !subscription_destroy || !on_close || !close_action_destroy ||
      !publish || version() != KOLE_API_VERSION) return 4;

  Host host = {0};
  host.runtime = create(); host.call_string = call_string; host.error_code = code; host.error = error;
  host.subscribe = subscribe; host.on_close = on_close;
  if (!host.runtime) return 6;
  set_output(host.runtime, output, &host);
  char script[1024];
  const char* args[] = {"native-host"};
  int result = 3;
  void* first = NULL;
  void* second = NULL;
  const char* path = "native-host-watch.txt";
  FileWatcher old_watcher = {0}, new_watcher = {0};
  if (!read_contents("examples/native-host/HostDemo.k", script, sizeof(script)) ||
      !load(host.runtime, script, "HostDemo.k")) {
    fprintf(stderr, "Kole error %d: %s\n", code(host.runtime), error(host.runtime));
    goto cleanup;
  }
  if (bind(host.runtime, "FileWatcher", "missing", native_start, &host) ||
      code(host.runtime) != KOLE_ERROR_PROGRAM) goto cleanup;
  if (!bind(host.runtime, "FileWatcher", "start", native_start, &host)) {
    fprintf(stderr, "Kole binding error %d: %s\n", code(host.runtime), error(host.runtime));
    goto cleanup;
  }
  if (!write_contents(path, "first")) goto cleanup;
  first = domain_create();
  host.domain = first; host.watcher = &old_watcher;
  if (!first || !run(host.runtime, "HostDemo", 1, args)) {
    fprintf(stderr, "Kole error %d: %s\n", code(host.runtime), error(host.runtime));
    goto cleanup;
  }
  if (!old_watcher.subscription) goto cleanup;
  if (call_string(host.runtime, "HostDemo", "missing", "x") ||
      code(host.runtime) != KOLE_ERROR_PROGRAM) goto cleanup;
  if (!write_contents(path, "second") || !watcher_poll(&old_watcher, publish) || host.output_lines != 2) goto cleanup;

  second = domain_replace(first);
  if (!second || !old_watcher.closed) goto cleanup;
  if (!write_contents(path, "third") || !watcher_poll(&old_watcher, publish) || host.output_lines != 2) goto cleanup;
  host.domain = second; host.watcher = &new_watcher;
  if (!call_string(host.runtime, "FileWatcher", "start", path) || !new_watcher.subscription) goto cleanup;
  if (!write_contents(path, "fourth") || !watcher_poll(&new_watcher, publish) || host.output_lines != 3) goto cleanup;
  domain_destroy(second); second = NULL;
  if (!new_watcher.closed || !write_contents(path, "fifth") ||
      !watcher_poll(&new_watcher, publish) || host.output_lines != 3 ||
      host.callback_failed || host.output_mismatch) goto cleanup;
  result = 0;
cleanup:
  if (second) domain_destroy(second);
  if (first) domain_destroy(first);
  if (old_watcher.subscription) subscription_destroy(old_watcher.subscription);
  if (old_watcher.close_action) close_action_destroy(old_watcher.close_action);
  if (new_watcher.subscription) subscription_destroy(new_watcher.subscription);
  if (new_watcher.close_action) close_action_destroy(new_watcher.close_action);
  remove(path);
  destroy(host.runtime);
  FreeLibrary(dll);
  return result;
}
