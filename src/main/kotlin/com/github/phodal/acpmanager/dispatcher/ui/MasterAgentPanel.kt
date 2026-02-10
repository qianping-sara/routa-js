package com.github.phodal.acpmanager.dispatcher.ui

import com.github.phodal.acpmanager.dispatcher.model.*
import com.intellij.icons.AllIcons
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import java.awt.*
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.*

/**
 * Master Agent section — compact top panel in the multi-agent dispatcher UI.
 *
 * Shows:
 * - Header row: icon, title, agent selector, status  (single row)
 * - Collapsible thinking area (default collapsed, 2-line preview)
 * - Collapsible plan items (default collapsed)
 * - Collapsible output area (hidden until output exists)
 */
class MasterAgentPanel : JPanel(BorderLayout()) {

    private val statusLabel = JBLabel("IDLE").apply {
        foreground = JBColor(0x6B7280, 0x9CA3AF)
        font = font.deriveFont(Font.BOLD, 11f)
    }

    private val statusDot = JBLabel("●").apply {
        foreground = JBColor(0x6B7280, 0x9CA3AF)
        font = font.deriveFont(12f)
    }

    private val masterAgentCombo = JComboBox<String>().apply {
        preferredSize = Dimension(160, 24)
    }

    // Thinking — collapsible with 1-line preview
    private var thinkingExpanded = false
    private val thinkingToggle = JBLabel("▶ THINKING").apply {
        foreground = JBColor(0x6B7280, 0x6B7280)
        font = font.deriveFont(Font.BOLD, 10f)
        cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
    }
    private val thinkingPreview = JBLabel("").apply {
        foreground = JBColor(0x8B949E, 0x8B949E)
        font = Font("Monospaced", Font.PLAIN, 11)
    }
    private val thinkingArea = JTextArea(2, 40).apply {
        isEditable = false
        lineWrap = true
        wrapStyleWord = true
        background = JBColor(0x1A1A2E, 0x0F0F1A)
        foreground = JBColor(0xC0C0C0, 0xA0A0A0)
        font = Font("Monospaced", Font.PLAIN, 11)
        border = JBUI.Borders.empty(4)
    }
    private val thinkingScroll = JScrollPane(thinkingArea).apply {
        border = BorderFactory.createLineBorder(JBColor(0x21262D, 0x21262D))
        preferredSize = Dimension(0, 40)
        isVisible = false
    }

    // Plan items — collapsible
    private var planExpanded = false
    private val planToggle = JBLabel("▶ PLAN").apply {
        foreground = JBColor(0x6B7280, 0x6B7280)
        font = font.deriveFont(Font.BOLD, 10f)
        cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
        isVisible = false
    }
    private val planItemsPanel = JPanel().apply {
        layout = BoxLayout(this, BoxLayout.Y_AXIS)
        isOpaque = false
        isVisible = false
    }

    // Result area — collapsible, hidden by default
    private val resultArea = JTextArea(3, 40).apply {
        isEditable = false
        lineWrap = true
        wrapStyleWord = true
        background = JBColor(0x0D2818, 0x0D2818)
        foreground = JBColor(0xA7F3D0, 0xA7F3D0)
        font = Font("Monospaced", Font.PLAIN, 11)
        border = JBUI.Borders.empty(4)
    }

    private val resultPanel = JPanel(BorderLayout(0, 2)).apply {
        isOpaque = false
        border = JBUI.Borders.emptyTop(4)
        isVisible = false

        val resultLabel = JBLabel("▼ OUTPUT").apply {
            foreground = JBColor(0x10B981, 0x10B981)
            font = font.deriveFont(Font.BOLD, 10f)
        }
        add(resultLabel, BorderLayout.NORTH)

        val resultScroll = JScrollPane(resultArea).apply {
            border = BorderFactory.createLineBorder(JBColor(0x10B981, 0x21262D))
            preferredSize = Dimension(0, 60)
        }
        add(resultScroll, BorderLayout.CENTER)
    }

    var onMasterAgentChanged: (String) -> Unit = {}

    init {
        isOpaque = true
        background = JBColor(0x0D1117, 0x0D1117)
        border = JBUI.Borders.compound(
            JBUI.Borders.customLineBottom(JBColor(0x21262D, 0x21262D)),
            JBUI.Borders.empty(6, 12)
        )

        // Header row: icon + title + agent combo + status (all single line)
        val headerPanel = JPanel(BorderLayout()).apply {
            isOpaque = false

            val leftPanel = JPanel(FlowLayout(FlowLayout.LEFT, 4, 0)).apply {
                isOpaque = false
                add(JBLabel(AllIcons.Actions.Lightning).apply {
                    toolTipText = "Master Agent"
                })
                add(JBLabel("MASTER").apply {
                    foreground = JBColor(0x58A6FF, 0x58A6FF)
                    font = font.deriveFont(Font.BOLD, 12f)
                })
                add(masterAgentCombo)
            }
            add(leftPanel, BorderLayout.WEST)

            val rightPanel = JPanel(FlowLayout(FlowLayout.RIGHT, 4, 0)).apply {
                isOpaque = false
                add(statusDot)
                add(statusLabel)
            }
            add(rightPanel, BorderLayout.EAST)
        }
        add(headerPanel, BorderLayout.NORTH)

        // Center: collapsible thinking + plan + result
        val centerPanel = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
            border = JBUI.Borders.emptyTop(4)

            // Thinking header row: toggle + preview
            val thinkingHeaderRow = JPanel(BorderLayout()).apply {
                isOpaque = false
                maximumSize = Dimension(Int.MAX_VALUE, 20)
                add(thinkingToggle, BorderLayout.WEST)
                add(thinkingPreview, BorderLayout.CENTER)
            }
            add(thinkingHeaderRow)
            add(thinkingScroll)

            // Plan toggle + items
            add(Box.createVerticalStrut(2))
            val planHeaderRow = JPanel(BorderLayout()).apply {
                isOpaque = false
                maximumSize = Dimension(Int.MAX_VALUE, 20)
                add(planToggle, BorderLayout.WEST)
            }
            add(planHeaderRow)
            add(planItemsPanel)

            // Result/output
            add(resultPanel)
        }
        add(centerPanel, BorderLayout.CENTER)

        // Toggle listeners
        thinkingToggle.addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                thinkingExpanded = !thinkingExpanded
                thinkingScroll.isVisible = thinkingExpanded
                thinkingToggle.text = if (thinkingExpanded) "▼ THINKING" else "▶ THINKING"
                thinkingPreview.isVisible = !thinkingExpanded
                revalidate()
                repaint()
            }
        })

        planToggle.addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                planExpanded = !planExpanded
                planItemsPanel.isVisible = planExpanded
                planToggle.text = if (planExpanded) "▼ PLAN" else "▶ PLAN"
                revalidate()
                repaint()
            }
        })

        masterAgentCombo.addActionListener {
            val selected = masterAgentCombo.selectedItem as? String ?: return@addActionListener
            onMasterAgentChanged(selected)
        }
    }

    fun setAvailableAgents(agents: List<String>) {
        masterAgentCombo.removeAllItems()
        agents.forEach { masterAgentCombo.addItem(it) }
    }

    fun setSelectedAgent(agentKey: String) {
        masterAgentCombo.selectedItem = agentKey
    }

    fun updateStatus(status: DispatcherStatus) {
        statusLabel.text = status.name
        val color = when (status) {
            DispatcherStatus.IDLE -> JBColor(0x6B7280, 0x9CA3AF)
            DispatcherStatus.PLANNING -> JBColor(0xF59E0B, 0xF59E0B)
            DispatcherStatus.PLANNED -> JBColor(0x3B82F6, 0x3B82F6)
            DispatcherStatus.RUNNING -> JBColor(0x10B981, 0x10B981)
            DispatcherStatus.PAUSED -> JBColor(0xF59E0B, 0xF59E0B)
            DispatcherStatus.COMPLETED -> JBColor(0x10B981, 0x10B981)
            DispatcherStatus.FAILED -> JBColor(0xEF4444, 0xEF4444)
        }
        statusLabel.foreground = color
        statusDot.foreground = color
    }

    fun updateThinking(text: String) {
        thinkingArea.text = text
        thinkingArea.caretPosition = 0
        // Update the 1-line preview (truncated)
        val preview = text.replace('\n', ' ').take(80)
        thinkingPreview.text = if (preview.length < text.length) "  $preview…" else "  $preview"
    }

    /**
     * Append streaming thinking text chunk.
     */
    fun appendThinkingChunk(chunk: String) {
        thinkingArea.append(chunk)
        // Update preview with latest content
        val fullText = thinkingArea.text
        val preview = fullText.replace('\n', ' ').take(80)
        thinkingPreview.text = if (preview.length < fullText.length) "  $preview…" else "  $preview"
        // Auto-scroll to bottom
        thinkingArea.caretPosition = thinkingArea.document.length
    }

    fun updatePlanItems(items: List<PlanItemDisplay>) {
        planItemsPanel.removeAll()
        for (item in items) {
            planItemsPanel.add(createPlanItemRow(item))
        }
        planToggle.isVisible = items.isNotEmpty()
        planToggle.text = if (planExpanded) "▼ PLAN (${items.size})" else "▶ PLAN (${items.size})"
        planItemsPanel.revalidate()
        planItemsPanel.repaint()
    }

    fun updateFinalOutput(output: String?) {
        if (output.isNullOrBlank()) {
            resultPanel.isVisible = false
            resultArea.text = ""
        } else {
            resultArea.text = output
            resultArea.caretPosition = 0
            resultPanel.isVisible = true
        }
        revalidate()
        repaint()
    }

    private fun createPlanItemRow(item: PlanItemDisplay): JPanel {
        return JPanel(BorderLayout()).apply {
            isOpaque = false
            border = JBUI.Borders.empty(1, 0)
            maximumSize = Dimension(Int.MAX_VALUE, 18)

            val statusIcon = when (item.status) {
                "ACTIVE", "RUNNING" -> JBLabel("●").apply { foreground = JBColor(0x10B981, 0x10B981); font = font.deriveFont(8f) }
                "BLOCKED" -> JBLabel("●").apply { foreground = JBColor(0xEF4444, 0xEF4444); font = font.deriveFont(8f) }
                "QUEUED" -> JBLabel("○").apply { foreground = JBColor(0x6B7280, 0x6B7280); font = font.deriveFont(8f) }
                "DONE" -> JBLabel("✓").apply { foreground = JBColor(0x10B981, 0x10B981); font = font.deriveFont(10f) }
                else -> JBLabel("○").apply { foreground = JBColor(0x6B7280, 0x6B7280); font = font.deriveFont(8f) }
            }

            val labelPanel = JPanel(FlowLayout(FlowLayout.LEFT, 3, 0)).apply {
                isOpaque = false
                add(JBLabel(item.index).apply {
                    foreground = JBColor(0x6B7280, 0x6B7280)
                    font = font.deriveFont(10f)
                })
                add(statusIcon)
                add(JBLabel(item.text).apply {
                    foreground = JBColor(0xC9D1D9, 0xC9D1D9)
                    font = font.deriveFont(11f)
                })
            }
            add(labelPanel, BorderLayout.CENTER)
        }
    }
}

/**
 * Display data for a plan item row.
 */
data class PlanItemDisplay(
    val index: String,
    val text: String,
    val status: String,
)
