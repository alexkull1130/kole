#include <stdio.h>
#include <windows.h>
#include "../../include/kole.h"
typedef int (__cdecl *api_fn)(void);
typedef void* (__cdecl *create_fn)(void);
typedef void (__cdecl *destroy_fn)(void*);
typedef void (__cdecl *output_fn)(void*, kole_output, void*);
typedef int (__cdecl *load_fn)(void*, const char*, const char*);
typedef int (__cdecl *run_fn)(void*, const char*, int, const char* const*);
typedef int (__cdecl *code_fn)(void*);
typedef const char* (__cdecl *error_fn)(void*);
static int output_lines;
static void output(void* context, const char* text) { (void)context; output_lines++; printf("script: %s\n", text); }
int main(void) {
  HMODULE dll = LoadLibraryA("kole_embedding.dll");
  if (!dll) return 5;
  api_fn version=(api_fn)GetProcAddress(dll,"kole_api_version");
  create_fn create=(create_fn)GetProcAddress(dll,"kole_runtime_create");
  destroy_fn destroy=(destroy_fn)GetProcAddress(dll,"kole_runtime_destroy");
  output_fn set_output=(output_fn)GetProcAddress(dll,"kole_runtime_set_output");
  load_fn load=(load_fn)GetProcAddress(dll,"kole_runtime_load");
  run_fn run=(run_fn)GetProcAddress(dll,"kole_runtime_run_with_args");
  code_fn code=(code_fn)GetProcAddress(dll,"kole_runtime_last_error_code");
  error_fn error=(error_fn)GetProcAddress(dll,"kole_runtime_last_error");
  if (!version||!create||!destroy||!set_output||!load||!run||!code||!error||version()!=KOLE_API_VERSION) return 4;
  void* runtime=create(); const char* args[]={"native-host"};
  set_output(runtime,output,NULL);
  if(!load(runtime,"class HostDemo { static main(args: string[]) -> void { Console.writeLine(\"Kole is hosted: \" + args[0]); }}","HostDemo.k")||!run(runtime,"HostDemo",1,args)){fprintf(stderr,"Kole error %d: %s\n",code(runtime),error(runtime));destroy(runtime);return 3;}
  destroy(runtime); return output_lines==1?0:10;
}
