package org.wallet.mdocnfchost

import kotlinx.datetime.LocalDate
import org.multipaz.cbor.Tstr
import org.multipaz.cbor.buildCborArray
import org.multipaz.cbor.buildCborMap
import org.multipaz.cbor.toDataItemFullDate
import kotlin.test.Test
import kotlin.test.assertEquals

class DrivingPrivilegeDisplayTest {
  @Test
  fun mapsIsoCategoryBToThaiPrivateCar() {
    assertEquals("รถยนต์ส่วนบุคคล", thaiVehicleTypeLabel("B"))
    assertEquals("รถยนต์ส่วนบุคคล", thaiVehicleTypeLabel("b"))
  }

  @Test
  fun mapsRemainingIsoCategories() {
    assertEquals("รถจักรยานยนต์", thaiVehicleTypeLabel("A"))
    assertEquals("รถบรรทุก", thaiVehicleTypeLabel("C"))
    assertEquals("รถโดยสาร", thaiVehicleTypeLabel("D"))
  }

  @Test
  fun unknownCodesStayAsTheCode() {
    assertEquals("Z", thaiVehicleTypeLabel("Z"))
  }

  @Test
  fun usesFirstPrivilegeCodeOnly() {
    assertEquals("รถยนต์ส่วนบุคคล", firstDrivingPrivilegeLabel(listOf("B", "A")))
    assertEquals("รถจักรยานยนต์", firstDrivingPrivilegeLabel(listOf("A", "B")))
    assertEquals("", firstDrivingPrivilegeLabel(emptyList()))
  }

  @Test
  fun readsIssueAndExpiryFromFirstPrivilege() {
    val privileges = buildCborArray {
      add(
        buildCborMap {
          put("vehicle_category_code", Tstr("B"))
          put("issue_date", LocalDate.parse("2023-01-01").toDataItemFullDate())
          put("expiry_date", LocalDate.parse("2033-01-01").toDataItemFullDate())
        },
      )
      add(
        buildCborMap {
          put("vehicle_category_code", Tstr("A"))
        },
      )
    }

    val display = readPrivilegeDisplay(privileges)
    assertEquals("รถยนต์ส่วนบุคคล", display.licenceClass)
    assertEquals("2023-01-01", display.issueDate)
    assertEquals("2033-01-01", display.expiryDate)
  }
}
