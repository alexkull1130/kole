import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Windows CI publishes and runs the NativeAOT C host", () => {
  const workflow = fs.readFileSync(".github/workflows/native-aot.yml", "utf8");
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /dotnet publish native\/Kole\.Embedding\.csproj/);
  assert.match(workflow, /\$nativeOutput = 'native\/bin\/Release\/net10\.0\/win-x64'/);
  assert.match(workflow, /Get-ChildItem \$nativeOutput -Recurse -Filter '\*\.lib'/);
  assert.match(workflow, /cl \/nologo \/I include examples\/native-host\/host\.c/);
  assert.match(workflow, /Get-ChildItem \$nativeOutput -Recurse -Filter 'kole_embedding\.dll'/);
  assert.match(workflow, /native-host-report\.txt/);
  assert.match(workflow, /\$PSNativeCommandUseErrorActionPreference = \$false/);
  assert.match(workflow, /\.\/native-host\.exe/);
});
