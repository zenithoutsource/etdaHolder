package com.wallet.dcapiprovider

import org.junit.Assert.assertEquals
import org.junit.Test

class DcApiCredentialJsonTest {
  @Test
  fun describeDeliveryShape_reportsOid4vp10ArrayVpToken() {
    val modern =
      """{"protocol":"openid4vp-v1-unsigned","data":{"vp_token":{"cred1":["device-response-base64url"]}}}"""

    val description = DcApiCredentialJson.describeDeliveryShape(modern)

    assertEquals(
      "deliveryShape=protocol=openid4vp-v1-unsigned vpToken=[cred1=array(len=1)]",
      description,
    )
  }

  @Test
  fun describeDeliveryShape_reportsEncryptedResponseMode() {
    val modern =
      """{"protocol":"openid4vp-v1-unsigned","data":{"response":"eyJhbGciOiJFQ0RILUVTK0EyNTZHQ00ifQ..ciphertext..tag"}}"""

    val description = DcApiCredentialJson.describeDeliveryShape(modern)

    assertEquals(
      "deliveryShape=protocol=openid4vp-v1-unsigned encrypted=true",
      description,
    )
  }
}
