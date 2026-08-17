package org.wallet.mdocnfchost

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.net.InetSocketAddress
import java.util.concurrent.Executors

object LocalVerifierServer {
  fun start(host: String = DEFAULT_HOST, port: Int = DEFAULT_PORT): HttpServer {
    val server = HttpServer.create(InetSocketAddress(host, port), 0)
    server.createContext("/") { exchange -> serveStatic(exchange) }
    server.createContext("/api/health") { exchange ->
      json(exchange, 200, buildJsonObject { put("ok", true) })
    }
    server.createContext("/api/present") { exchange -> handlePresent(exchange) }
    server.executor = Executors.newCachedThreadPool()
    server.start()
    println("mdoc NFC host listening at http://$host:$port")
    println("Open the page, click Wait for tap, then hold the armed phone to the ACR1311.")
    return server
  }

  private fun handlePresent(exchange: HttpExchange) {
    if (exchange.requestMethod != "POST") {
      json(exchange, 405, errorJson("METHOD", "POST /api/present is required"))
      return
    }
    val body = exchange.requestBody.readBytes().toString(Charsets.UTF_8)
    val engagement = try {
      val obj = Json.parseToJsonElement(body).jsonObject
      obj["engagement"]?.jsonPrimitive?.contentOrNull
    } catch (error: Exception) {
      json(exchange, 400, errorJson("INVALID_QR", error.message ?: "Invalid JSON"))
      return
    }

    try {
      val result = runBlocking {
        MdocNfcReaderSession.present(engagement)
      }
      json(
        exchange,
        200,
        buildJsonObject {
          put("ok", true)
          put("issuerAttestationVerified", result.issuerAttestationVerified)
          put("diagnostic", result.diagnostic)
          put(
            "claims",
            buildJsonObject {
              result.claims.forEach { (key, value) -> put(key, value) }
            },
          )
        },
      )
    } catch (error: MdocPresentmentException) {
      json(exchange, 200, errorJson(error.code, error.message ?: "Presentment failed"))
    } catch (error: Throwable) {
      val mapped = StatusWordMapper.fromTransportOpenFailure(error)
      json(exchange, 200, errorJson(mapped.code, mapped.message))
    }
  }

  private fun serveStatic(exchange: HttpExchange) {
    val path = when (val raw = exchange.requestURI.path) {
      "/", "" -> "/index.html"
      else -> raw
    }
    val resource = javaClass.getResource("/web$path")
    if (resource == null) {
      exchange.sendResponseHeaders(404, -1)
      exchange.close()
      return
    }
    val bytes = resource.readBytes()
    val contentType = when {
      path.endsWith(".js") -> "text/javascript; charset=utf-8"
      path.endsWith(".css") -> "text/css; charset=utf-8"
      else -> "text/html; charset=utf-8"
    }
    exchange.responseHeaders.add("Content-Type", contentType)
    exchange.sendResponseHeaders(200, bytes.size.toLong())
    exchange.responseBody.use { it.write(bytes) }
  }

  private fun errorJson(code: String, message: String): JsonObject = buildJsonObject {
    put("ok", false)
    put("code", code)
    put("message", message)
  }

  private fun json(exchange: HttpExchange, status: Int, body: JsonObject) {
    val bytes = body.toString().toByteArray()
    exchange.responseHeaders.add("Content-Type", "application/json; charset=utf-8")
    exchange.sendResponseHeaders(status, bytes.size.toLong())
    exchange.responseBody.use { it.write(bytes) }
  }
}
