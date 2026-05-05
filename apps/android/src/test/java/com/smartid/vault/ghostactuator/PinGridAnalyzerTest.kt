package com.smartid.vault.ghostactuator

import android.accessibilityservice.AccessibilityService
import android.graphics.Rect
import android.view.accessibility.AccessibilityNodeInfo
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mock
import org.mockito.junit.MockitoJUnitRunner
import org.mockito.kotlin.any
import org.mockito.kotlin.whenever

@RunWith(MockitoJUnitRunner::class)
class PinGridAnalyzerTest {

    @Mock
    private lateinit var service: AccessibilityService

    @Mock
    private lateinit var rootNode: AccessibilityNodeInfo

    private lateinit var analyzer: PinGridAnalyzer

    @Before
    fun setUp() {
        analyzer = PinGridAnalyzer(service)
        whenever(rootNode.packageName).thenReturn("ee.sk.smartid")
        whenever(service.rootInActiveWindow).thenReturn(rootNode)
    }

    @Test
    fun `analyzer parses known grid layout correctly`() {
        val gridContainer = createMockGridContainer()
        whenever(rootNode.childCount).thenReturn(1)
        whenever(rootNode.getChild(0)).thenReturn(gridContainer)

        val result = analyzer.analyze()

        assert(result != null) { "GridInfo should not be null" }
        assert(result!!.centerPositions.size == 10) {
            "Expected 10 digit positions, got ${result.centerPositions.size}"
        }

        val firstDigit = result.centerPositions[0]
        assert(firstDigit.first > 0f) { "X coordinate should be positive" }
        assert(firstDigit.second > 0f) { "Y coordinate should be positive" }

        val lastDigit = result.centerPositions[9]
        assert(lastDigit.second >= firstDigit.second) {
            "Last digit row should be below first digit row"
        }

        assert(result.gridBounds.width() > 0) { "Grid width should be positive" }
        assert(result.gridBounds.height() > 0) { "Grid height should be positive" }
    }

    @Test
    fun `analyzer returns null for non-Smart-ID app`() {
        whenever(rootNode.packageName).thenReturn("com.android.chrome")

        val result = analyzer.analyze()

        assert(result == null) { "Should return null for non-Smart-ID app" }
    }

    @Test
    fun `analyzer returns null when no grid found`() {
        whenever(rootNode.childCount).thenReturn(0)

        val result = analyzer.analyze()

        assert(result == null) { "Should return null when no grid found" }
    }

    @Test
    fun `findGridContainer finds by resource ID`() {
        val expected = createMockGridContainer()
        whenever(rootNode.viewIdResourceName).thenReturn(null)
        whenever(rootNode.childCount).thenReturn(1)
        whenever(rootNode.getChild(0)).thenReturn(expected)
        whenever(expected.viewIdResourceName).thenReturn("com.smartid:id/keypad_grid")

        val found = analyzer.findGridContainer(rootNode)

        assert(found != null) { "Should find grid container by resource ID" }
    }

    @Test
    fun `findGridContainer falls back to heuristic`() {
        val expected = createMockGridContainer()
        whenever(rootNode.viewIdResourceName).thenReturn(null)
        whenever(rootNode.childCount).thenReturn(1)
        whenever(rootNode.getChild(0)).thenReturn(expected)
        whenever(expected.viewIdResourceName).thenReturn("com.smartid:id/some_layout")

        val found = analyzer.findGridContainer(rootNode)

        assert(found != null) { "Should find grid container by heuristic" }
    }

    @Test
    fun `extractDigitButtons returns only button children`() {
        val container = createMockGridContainer()

        val buttons = analyzer.extractDigitButtons(container)

        assert(buttons.size == 10) {
            "Expected 10 digit buttons, got ${buttons.size}"
        }
    }

    private fun createMockGridContainer(): AccessibilityNodeInfo {
        val container = createMockNode(
            viewId = "com.smartid:id/keypad_grid",
            className = "android.widget.GridLayout",
            childCount = 10,
        )
        for (i in 0 until 10) {
            val row = i / 3
            val col = i % 3
            val left = 100 + col * 150
            val top = 300 + row * 150
            val child = createMockNode(
                viewId = "com.smartid:id/keypad_$i",
                className = "android.widget.Button",
                bounds = Rect(left, top, left + 120, top + 120),
            )
            whenever(container.getChild(i)).thenReturn(child)
        }
        return container
    }

    private fun createMockNode(
        viewId: String? = null,
        className: String = "android.view.View",
        childCount: Int = 0,
        bounds: Rect = Rect(0, 0, 100, 100),
    ): AccessibilityNodeInfo {
        val node = org.mockito.kotlin.mock<AccessibilityNodeInfo>()
        whenever(node.viewIdResourceName).thenReturn(viewId)
        whenever(node.className).thenReturn(className)
        whenever(node.childCount).thenReturn(childCount)
        whenever(node.boundsInScreen).thenReturn(bounds)
        whenever(node.isVisibleToUser).thenReturn(true)
        if (childCount == 0) {
            whenever(node.getChild(any<Int>())).thenReturn(null)
        }
        return node
    }
}
