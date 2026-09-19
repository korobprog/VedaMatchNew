package com.vedamatch.calls

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StaleCallPolicyTest {
  @Test
  fun порогВышеСерверногоТаймераДозвона() {
    assertEquals(45_000L, StaleCallPolicy.SERVER_RING_TIMEOUT_MS)
    assertTrue(StaleCallPolicy.STALE_RING_AFTER_MS > StaleCallPolicy.SERVER_RING_TIMEOUT_MS)
    assertEquals(60_000L, StaleCallPolicy.STALE_RING_AFTER_MS)
  }

  @Test
  fun звонящийМоложеПорогаНеПротух() {
    assertFalse(StaleCallPolicy.isStale(ringing = true, ageMs = 0))
    assertFalse(StaleCallPolicy.isStale(ringing = true, ageMs = StaleCallPolicy.STALE_RING_AFTER_MS - 1))
  }

  @Test
  fun звонящийНаПорогеИСтаршеПротух() {
    assertTrue(StaleCallPolicy.isStale(ringing = true, ageMs = StaleCallPolicy.STALE_RING_AFTER_MS))
    // Случай прода: звонил шесть минут.
    assertTrue(StaleCallPolicy.isStale(ringing = true, ageMs = 6 * 60_000L))
  }

  @Test
  fun идущийРазговорПоВозрастуНеПротухает() {
    assertFalse(StaleCallPolicy.isStale(ringing = false, ageMs = 3 * 60 * 60_000L))
  }

  @Test
  fun отметкаЗавершённогоЗвонкаВидна() {
    val tombstones = EndedCallTombstones()
    assertFalse(tombstones.isEnded("call-1", 0))
    tombstones.mark("call-1", 0)
    assertTrue(tombstones.isEnded("call-1", 1_000))
    assertFalse(tombstones.isEnded("call-2", 1_000))
  }

  @Test
  fun отметкаИстекаетПоTtl() {
    val tombstones = EndedCallTombstones(ttlMs = 1_000)
    tombstones.mark("call-1", 0)
    assertTrue(tombstones.isEnded("call-1", 1_000))
    assertFalse(tombstones.isEnded("call-1", 1_001))
  }

  @Test
  fun размерОграниченСтарыеВытесняются() {
    val tombstones = EndedCallTombstones(maxSize = 2)
    tombstones.mark("a", 0)
    tombstones.mark("b", 1)
    tombstones.mark("c", 2)
    assertFalse(tombstones.isEnded("a", 3))
    assertTrue(tombstones.isEnded("b", 3))
    assertTrue(tombstones.isEnded("c", 3))
  }

  @Test
  fun пустойCallIdНеЗапоминается() {
    val tombstones = EndedCallTombstones()
    tombstones.mark("", 0)
    assertFalse(tombstones.isEnded("", 0))
  }
}
