package com.smartid.vault.ghostactuator

import android.accessibilityservice.AccessibilityService
import android.graphics.Rect
import android.view.accessibility.AccessibilityNodeInfo

data class GridInfo(
    val centerPositions: List<Pair<Float, Float>>,
    val gridBounds: Rect,
    val appVersionCode: Int,
)

class PinGridAnalyzer(private val service: AccessibilityService) {

    private val smartIdPackages = setOf("ee.sk.smartid")

    fun analyze(): GridInfo? {
        val root = service.rootInActiveWindow ?: return null
        try {
            if (root.packageName !in smartIdPackages) return null

            val gridContainer = findGridContainer(root) ?: return null
            val digitButtons = extractDigitButtons(gridContainer)
            val gridBounds = Rect(gridContainer.boundsInScreen)
            gridContainer.recycle()

            if (digitButtons.size < 10) {
                digitButtons.forEach { it.recycle() }
                return null
            }

            val sorted = digitButtons.sortedBy {
                it.boundsInScreen.top * 10000L + it.boundsInScreen.left
            }

            val centers = sorted.map { (it.boundsInScreen.exactCenterX() to it.boundsInScreen.exactCenterY()) }
            sorted.forEach { it.recycle() }

            return GridInfo(
                centerPositions = centers,
                gridBounds = gridBounds,
                appVersionCode = getAppVersionCode(root),
            )
        } finally {
            root.recycle()
        }
    }

    fun analyzeWithFallback(): GridInfo? {
        val root = service.rootInActiveWindow
        val isSmartIdForeground = root?.packageName in smartIdPackages
        root?.recycle()
        if (!isSmartIdForeground) return null
        return analyze() ?: buildHardcodedGrid()
    }

    fun findGridContainer(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        val resourceIdPatterns = listOf(
            "ee.sk.smartid:id/keypad",
            "ee.sk.smartid:id/grid",
            "ee.sk.smartid:id/pin_container",
            "ee.sk.smartid:id/digit_grid",
        )

        for (pattern in resourceIdPatterns) {
            val found = findNodeByResourceIdPrefix(root, pattern)
            if (found != null) {
                if (found.childCount in 10..12) return found
                found.recycle()
            }
        }

        return findGridByHeuristic(root)
    }

    fun extractDigitButtons(container: AccessibilityNodeInfo): List<AccessibilityNodeInfo> {
        val buttons = mutableListOf<AccessibilityNodeInfo>()
        for (i in 0 until container.childCount) {
            val child = container.getChild(i) ?: continue
            if (isDigitButton(child)) {
                buttons.add(child)
            } else {
                child.recycle()
            }
        }
        return buttons
    }

    private fun isDigitButton(node: AccessibilityNodeInfo): Boolean {
        if (node.className?.contains("Button") != true) return false
        if (!node.isVisibleToUser) return false
        val bounds = node.boundsInScreen
        if (bounds.isEmpty) return false
        if (bounds.width() < 10 || bounds.height() < 10) return false
        val label = node.text?.toString() ?: node.contentDescription?.toString() ?: ""
        val actionLabels = listOf("delete", "back", "confirm", "ok", "enter", "clear")
        if (actionLabels.any { label.contains(it, ignoreCase = true) }) return false
        if (label.length == 1 && label[0] in '0'..'9') return true
        if (label.toIntOrNull() != null) return true
        val resId = node.viewIdResourceName?.lowercase() ?: ""
        if (resId.contains("digit") || resId.contains("key") || resId.contains("num")) return true
        return false
    }

    private fun findNodeByResourceIdPrefix(
        root: AccessibilityNodeInfo,
        prefix: String
    ): AccessibilityNodeInfo? {
        if (root.viewIdResourceName?.startsWith(prefix) == true) {
            return AccessibilityNodeInfo.obtain(root)
        }

        val childrenToVisit = mutableListOf<AccessibilityNodeInfo>()
        for (i in 0 until root.childCount) {
            val child = root.getChild(i) ?: continue
            childrenToVisit.add(child)
        }

        for (child in childrenToVisit) {
            val result = findNodeByResourceIdPrefix(child, prefix)
            if (result != null) {
                childrenToVisit.forEach { c -> if (c != child) c.recycle() }
                return result
            }
            child.recycle()
        }
        return null
    }

    private fun findGridByHeuristic(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        val candidates = mutableListOf<Pair<AccessibilityNodeInfo, Int>>()
        findCandidateGrids(root, candidates)
        if (candidates.isEmpty()) return null

        candidates.sortByDescending { (_, count) -> count }
        val (best, _) = candidates.first()
        for (i in 1 until candidates.size) {
            if (candidates[i].first != best) {
                candidates[i].first.recycle()
            }
        }
        return best
    }

    private fun findCandidateGrids(
        node: AccessibilityNodeInfo,
        candidates: MutableList<Pair<AccessibilityNodeInfo, Int>>
    ) {
        val children = (0 until node.childCount).mapNotNull { node.getChild(it) }
        val digitCount = children.count { isDigitButton(it) }

        if (digitCount in 10..12) {
            candidates.add(AccessibilityNodeInfo.obtain(node) to digitCount)
            children.forEach { it.recycle() }
            return
        }

        children.forEach { child ->
            findCandidateGrids(child, candidates)
            child.recycle()
        }
    }

    private fun buildHardcodedGrid(): GridInfo? {
        val versionCode = try {
            service.packageManager.getPackageInfo("ee.sk.smartid", 0).versionCode
        } catch (_: Exception) {
            return null
        }

        val displayMetrics = service.resources.displayMetrics
        val width = displayMetrics.widthPixels
        val height = displayMetrics.heightPixels

        val knownLayout = knownGridLayouts[versionCode]
            ?: knownGridLayouts.values.lastOrNull()
            ?: return null

        val gridWidth = knownLayout.gridWidthFraction * width
        val gridHeight = knownLayout.gridHeightFraction * height
        val gridLeft = (width - gridWidth) / 2f
        val gridTop = knownLayout.topOffsetFraction * height

        val colWidth = gridWidth / knownLayout.columns
        val rowHeight = gridHeight / knownLayout.rows

        val centers = mutableListOf<Pair<Float, Float>>()
        for (row in 0 until knownLayout.rows) {
            for (col in 0 until knownLayout.columns) {
                val index = row * knownLayout.columns + col
                if (index >= 10) break
                val cx = gridLeft + col * colWidth + colWidth / 2f
                val cy = gridTop + row * rowHeight + rowHeight / 2f
                centers.add(Pair(cx, cy))
            }
        }

        return GridInfo(
            centerPositions = centers.take(10),
            gridBounds = Rect(
                gridLeft.toInt(), gridTop.toInt(),
                (gridLeft + gridWidth).toInt(), (gridTop + gridHeight).toInt()
            ),
            appVersionCode = versionCode,
        )
    }

    private fun getAppVersionCode(root: AccessibilityNodeInfo): Int {
        val pkg = root.packageName?.toString() ?: return 0
        return try {
            service.packageManager.getPackageInfo(pkg, 0).versionCode
        } catch (_: Exception) {
            0
        }
    }

    private data class GridLayout(
        val columns: Int,
        val rows: Int,
        val gridWidthFraction: Float,
        val gridHeightFraction: Float,
        val topOffsetFraction: Float,
        val buttonMarginFraction: Float,
    )

    private val knownGridLayouts = mapOf(
        0 to GridLayout(
            columns = 3, rows = 4,
            gridWidthFraction = 0.75f, gridHeightFraction = 0.50f,
            topOffsetFraction = 0.35f, buttonMarginFraction = 0.05f,
        ),
    )
}
