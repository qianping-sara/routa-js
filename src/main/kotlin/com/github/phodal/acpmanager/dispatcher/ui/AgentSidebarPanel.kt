package com.github.phodal.acpmanager.dispatcher.ui

import com.intellij.ui.JBColor
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import java.awt.*
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.*

/**
 * Right-side agent sidebar — a vertical list of clickable agent cards.
 *
 * Fixed order: **ROUTA** always first, **GATE** always last,
 * CRAFTER cards are dynamically inserted between them as tasks are created.
 *
 * Each card shows a status dot, role label, short info, and highlights when selected.
 * Clicking a card fires [onAgentSelected].
 */
class AgentSidebarPanel : JPanel(BorderLayout()) {

    companion object {
        val SIDEBAR_BG = JBColor(0x0D1117, 0x0D1117)
        val CARD_BG = JBColor(0x161B22, 0x161B22)
        val CARD_SELECTED_BG = JBColor(0x1C2333, 0x1C2333)
        val CARD_HOVER_BG = JBColor(0x1A2030, 0x1A2030)
        val CARD_BORDER = JBColor(0x21262D, 0x21262D)
        val TEXT_PRIMARY = JBColor(0xC9D1D9, 0xC9D1D9)
        val TEXT_SECONDARY = JBColor(0x8B949E, 0x8B949E)

        // Status colors
        val STATUS_IDLE = JBColor(0x6B7280, 0x9CA3AF)
        val STATUS_ACTIVE = JBColor(0x3B82F6, 0x3B82F6)
        val STATUS_COMPLETED = JBColor(0x10B981, 0x10B981)
        val STATUS_ERROR = JBColor(0xEF4444, 0xEF4444)
        val STATUS_PLANNING = JBColor(0xF59E0B, 0xF59E0B)
        val STATUS_VERIFYING = JBColor(0xA78BFA, 0xA78BFA)
    }

    /** Callback when an agent card is selected. Receives the agent ID. */
    var onAgentSelected: (String) -> Unit = {}

    // ── Internal state ───────────────────────────────────────────────────

    /** Ordered list of agent IDs in display order. */
    private val agentOrder = mutableListOf<String>()

    /** Maps agentId → sidebar card component. */
    private val cards = mutableMapOf<String, SidebarCard>()

    /** Currently selected agent ID. */
    var selectedAgentId: String? = null
        private set

    // Fixed agent IDs
    private val routaId = "__routa__"
    private val gateId = "__gate__"

    // ── UI components ────────────────────────────────────────────────────

    private val headerLabel = JBLabel("Agents").apply {
        foreground = TEXT_SECONDARY
        font = font.deriveFont(Font.BOLD, 11f)
        border = JBUI.Borders.empty(8, 12, 6, 12)
    }

    private val cardListPanel = JPanel().apply {
        layout = BoxLayout(this, BoxLayout.Y_AXIS)
        isOpaque = true
        background = SIDEBAR_BG
    }

    private val cardListScroll = JScrollPane(cardListPanel).apply {
        border = JBUI.Borders.empty()
        verticalScrollBarPolicy = JScrollPane.VERTICAL_SCROLLBAR_AS_NEEDED
        horizontalScrollBarPolicy = JScrollPane.HORIZONTAL_SCROLLBAR_NEVER
        isOpaque = true
        viewport.isOpaque = true
        viewport.background = SIDEBAR_BG
    }

    init {
        isOpaque = true
        background = SIDEBAR_BG
        border = JBUI.Borders.customLineLeft(CARD_BORDER)

        add(headerLabel, BorderLayout.NORTH)
        add(cardListScroll, BorderLayout.CENTER)

        // Create fixed ROUTA and GATE cards
        addFixedCard(routaId, "ROUTA", "Coordinator")
        addFixedCard(gateId, "GATE", "Verifier")
    }

    // ── Public API ───────────────────────────────────────────────────────

    /** Get the fixed ROUTA agent ID. */
    fun getRoutaId(): String = routaId

    /** Get the fixed GATE agent ID. */
    fun getGateId(): String = gateId

    /**
     * Add a CRAFTER card. Inserted before GATE (always last).
     */
    fun addCrafter(taskId: String, title: String) {
        SwingUtilities.invokeLater {
            if (taskId in cards) return@invokeLater

            val card = SidebarCard(
                agentId = taskId,
                roleLabel = "CRAFTER",
                info = truncate(title, 24),
                onClick = { selectAgent(taskId) }
            )
            cards[taskId] = card

            // Insert before GATE
            val gateIndex = agentOrder.indexOf(gateId)
            if (gateIndex >= 0) {
                agentOrder.add(gateIndex, taskId)
            } else {
                agentOrder.add(taskId)
            }

            rebuildCardList()
        }
    }

    /**
     * Update an agent card's status.
     */
    fun updateAgentStatus(agentId: String, statusText: String, statusColor: Color) {
        SwingUtilities.invokeLater {
            cards[agentId]?.updateStatus(statusText, statusColor)
        }
    }

    /**
     * Update a card's info text (e.g. task title).
     */
    fun updateAgentInfo(agentId: String, info: String) {
        SwingUtilities.invokeLater {
            cards[agentId]?.updateInfo(truncate(info, 24))
        }
    }

    /**
     * Select an agent by ID (highlights the card and fires callback).
     */
    fun selectAgent(agentId: String) {
        if (agentId !in cards) return
        selectedAgentId = agentId
        cards.values.forEach { it.setSelected(false) }
        cards[agentId]?.setSelected(true)
        onAgentSelected(agentId)
    }

    /**
     * Clear all CRAFTER cards and reset state. ROUTA and GATE cards remain.
     */
    fun clear() {
        SwingUtilities.invokeLater {
            // Remove all crafter cards
            val crafterIds = agentOrder.filter { it != routaId && it != gateId }
            crafterIds.forEach { id ->
                cards.remove(id)
                agentOrder.remove(id)
            }

            // Reset ROUTA and GATE status
            cards[routaId]?.updateStatus("IDLE", STATUS_IDLE)
            cards[gateId]?.updateStatus("IDLE", STATUS_IDLE)

            rebuildCardList()

            // Select ROUTA by default
            selectAgent(routaId)
        }
    }

    // ── Internal ─────────────────────────────────────────────────────────

    private fun addFixedCard(id: String, role: String, info: String) {
        val card = SidebarCard(
            agentId = id,
            roleLabel = role,
            info = info,
            onClick = { selectAgent(id) }
        )
        cards[id] = card
        agentOrder.add(id)
        rebuildCardList()
    }

    private fun rebuildCardList() {
        cardListPanel.removeAll()
        for (id in agentOrder) {
            cards[id]?.let { card ->
                card.alignmentX = Component.LEFT_ALIGNMENT
                card.maximumSize = Dimension(Int.MAX_VALUE, 48)
                cardListPanel.add(card)
            }
        }
        cardListPanel.add(Box.createVerticalGlue())
        cardListPanel.revalidate()
        cardListPanel.repaint()
    }

    private fun truncate(text: String, maxLen: Int): String {
        val clean = text.trim()
        return if (clean.length > maxLen) clean.take(maxLen - 3) + "..." else clean
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SidebarCard — individual clickable card in the agent sidebar
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A single card in the agent sidebar.
 * Shows: status dot | role label | info text | status text
 */
private class SidebarCard(
    val agentId: String,
    roleLabel: String,
    info: String,
    private val onClick: () -> Unit,
) : JPanel(BorderLayout()) {

    private val statusDot = JBLabel("●").apply {
        foreground = AgentSidebarPanel.STATUS_IDLE
        font = font.deriveFont(10f)
        border = JBUI.Borders.empty(0, 0, 0, 6)
    }

    private val roleText = JBLabel(roleLabel).apply {
        foreground = AgentSidebarPanel.TEXT_PRIMARY
        font = font.deriveFont(Font.BOLD, 11f)
    }

    private val infoText = JBLabel(info).apply {
        foreground = AgentSidebarPanel.TEXT_SECONDARY
        font = font.deriveFont(10f)
    }

    private val statusLabel = JBLabel("IDLE").apply {
        foreground = AgentSidebarPanel.STATUS_IDLE
        font = font.deriveFont(Font.BOLD, 9f)
        horizontalAlignment = SwingConstants.RIGHT
    }

    private var isCardSelected = false

    init {
        isOpaque = true
        background = AgentSidebarPanel.CARD_BG
        border = BorderFactory.createCompoundBorder(
            BorderFactory.createMatteBorder(0, 0, 1, 0, AgentSidebarPanel.CARD_BORDER),
            JBUI.Borders.empty(8, 12, 8, 12)
        )
        cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)

        val leftPanel = JPanel(FlowLayout(FlowLayout.LEFT, 4, 0)).apply {
            isOpaque = false
            add(statusDot)
            add(roleText)
            add(JBLabel("·").apply { foreground = AgentSidebarPanel.TEXT_SECONDARY })
            add(infoText)
        }

        add(leftPanel, BorderLayout.CENTER)
        add(statusLabel, BorderLayout.EAST)

        addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                onClick()
            }

            override fun mouseEntered(e: MouseEvent) {
                if (!isCardSelected) {
                    background = AgentSidebarPanel.CARD_HOVER_BG
                }
            }

            override fun mouseExited(e: MouseEvent) {
                background = if (isCardSelected) AgentSidebarPanel.CARD_SELECTED_BG
                else AgentSidebarPanel.CARD_BG
            }
        })
    }

    fun setSelected(selected: Boolean) {
        isCardSelected = selected
        background = if (selected) AgentSidebarPanel.CARD_SELECTED_BG
        else AgentSidebarPanel.CARD_BG

        border = if (selected) {
            BorderFactory.createCompoundBorder(
                BorderFactory.createMatteBorder(0, 3, 1, 0, AgentSidebarPanel.STATUS_ACTIVE),
                JBUI.Borders.empty(8, 9, 8, 12)
            )
        } else {
            BorderFactory.createCompoundBorder(
                BorderFactory.createMatteBorder(0, 0, 1, 0, AgentSidebarPanel.CARD_BORDER),
                JBUI.Borders.empty(8, 12, 8, 12)
            )
        }
    }

    fun updateStatus(text: String, color: Color) {
        statusDot.foreground = color
        statusLabel.text = text
        statusLabel.foreground = color
    }

    fun updateInfo(info: String) {
        infoText.text = info
    }
}
