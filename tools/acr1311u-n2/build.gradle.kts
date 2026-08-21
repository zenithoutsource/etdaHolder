plugins {
  kotlin("jvm") version "2.2.21"
  application
}

group = "org.wallet"
version = "0.1.0"

java {
  toolchain {
    languageVersion.set(JavaLanguageVersion.of(17))
  }
}

kotlin {
  compilerOptions {
    jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    freeCompilerArgs.add("-Xjdk-release=17")
    freeCompilerArgs.add("-Xadd-modules=java.smartcardio")
  }
}

tasks.withType<JavaExec>().configureEach {
  jvmArgs("--add-modules", "java.smartcardio")
}

application {
  mainClass.set("org.wallet.mdocnfchost.MainKt")
}

dependencies {
  implementation("org.multipaz:multipaz-jvm:0.100.0")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
  implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
  testImplementation(kotlin("test"))
}

tasks.test {
  useJUnitPlatform()
  jvmArgs("--add-modules", "java.smartcardio")
}

tasks.register<JavaExec>("generateMdl") {
  group = "application"
  description = "Generate a TEST IACA and issuer-signed mDL (inspect/host fixtures)"
  classpath = sourceSets["main"].runtimeClasspath
  mainClass.set("org.wallet.mdocnfchost.MainKt")
  args = listOf("generate-mdl") + (project.findProperty("mdlArgs") as String?)
    ?.split(" ")
    ?.filter { it.isNotBlank() }
    .orEmpty()
}
