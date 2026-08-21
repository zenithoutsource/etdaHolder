package org.wallet.mdocnfchost

import kotlinx.coroutines.runBlocking
import java.nio.file.Path

fun main(args: Array<String>) {
  if (args.firstOrNull() == "generate-mdl") {
    runGenerateMdl(args.drop(1))
    return
  }
  LocalVerifierServer.start()
  Thread.currentThread().join()
}

private fun runGenerateMdl(args: List<String>) {
  val out = readArg(args, "--out") ?: "testdata"
  val deviceJwkPath = readArg(args, "--device-jwk")
  val deviceJwk = deviceJwkPath?.let { java.nio.file.Files.readString(Path.of(it)) }
  val generated = runBlocking {
    TestMdlGenerator.generateWithOptionalDeviceJwk(deviceJwk).first
  }
  val outDir = Path.of(out)
  TestMdlGenerator.writeArtifacts(generated, outDir)
  println("TEST mDL written to $outDir")
  println("doctype=$MDL_DOCTYPE family_name=${generated.familyName} given_name=${generated.givenName} birth_date=${generated.birthDate}")
  if (generated.deviceKeyPem != null) {
    println("Software device key written next to the mdoc. That file is for inspection only — do not inject it into the wallet.")
  }
}

private fun readArg(args: List<String>, name: String): String? {
  val index = args.indexOf(name)
  if (index < 0 || index >= args.lastIndex) return null
  return args[index + 1]
}
