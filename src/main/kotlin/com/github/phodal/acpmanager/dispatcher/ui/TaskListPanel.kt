package com.github.phodal.acpmanager.dispatcher.ui

import com.github.phodal.acpmanager.dispatcher.model.*
import com.intellij.icons.AllIcons
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.JBUI
import java.awt.*
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.*

/**
 * Tasks panel — collapsible task list section of the multi-agent dispatcher UI.
 *
 * Shows:
 * - Collapsible header (default collapsed, showing task count)
 * - List of compact task cards with agent, progress, and output preview
 * - Execute button + parallelism control in header
 */
class TaskListPanel : JPanel(BorderLayout()) {

    private val taskCards = mutableListOf<TaskCardPanel>()
    private val tasksContainer = JPanel().apply {
        layout = BoxLayout(this, BoxLayout.Y_AXIS)
        isOpaque = false
    }
    private val headerLabel = JBLabel("▶ TASKS  0/0").apply {
        foreground = JBColor(0x8B949E, 0x8B949E)
        font = font.deriveFont(Font.BOLD, 11f)
        cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
    }
    private val agentBadge = JBLabel("0/0 active").apply {
        foreground = JBColor(0x8B949E, 0x8B949E)
        font = font.deriveFont(10f)
    }
    private val executeButton = JButton("Execute").apply {
        icon = AllIcons.Actions.Execute
        isEnabled = false
        preferredSize = Dimension(100, 24)
    }
    private val parallelismSpinner = JSpinner(SpinnerNumberModel(1, 1, 5, 1)).apply {
        preferredSize = Dimension(50, 24)
        toolTipText = "Maximum parallel tasks"
    }

    var onExecute: () -> Unit = {}
    var onTaskAgentChanged: (taskId: String, newAgent: String) -> Unit = { _, _ -> }
    var onParallelismChanged: (Int) -> Unit = {}
    var onTaskStop: (taskId: String) -> Unit = {}

    private var availableAgents: List<String> = emptyList()
    private var expanded = false

    private val scrollPane = JBScrollPane(tasksContainer).apply {
        border = JBUI.Borders.empty()
        verticalScrollBarPolicy = JScrollPane.VERTICAL_SCROLLBAR_AS_NEEDED
        isVisible = false
    }

    init {
        isOpaque = true
        background = JBColor(0x0D1117, 0x0D1117)
        border = JBUI.Borders.compound(
            JBUI.Borders.customLineBottom(JBColor(0x21262D, 0x21262D)),
            JBUI.Borders.empty(4, 12)
        )

        // Header
        val headerPanel = JPanel(BorderLayout()).apply {
            isOpaque = false

            val leftPanel = JPanel(FlowLayout(FlowLayout.LEFT, 6, 0)).apply {
                isOpaque = false
                add(headerLabel)
                add(JBLabel("│").apply { foreground = JBColor(0x30363D, 0x30363D) })
                add(agentBadge)
            }
            add(leftPanel, BorderLayout.WEST)

            val rightPanel = JPanel(FlowLayout(FlowLayout.RIGHT, 4, 0)).apply {
                isOpaque = false
                add(JBLabel("P:").apply {
                    foreground = JBColor(0x8B949E, 0x8B949E)
                    font = font.deriveFont(10f)
                })
                add(parallelismSpinner)
                add(executeButton)
            }
            add(rightPanel, BorderLayout.EAST)
        }
        add(headerPanel, BorderLayout.NORTH)
        add(scrollPane, BorderLayout.CENTER)

        // Toggle expand/collapse
        headerLabel.addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                expanded = !expanded
                scrollPane.isVisible = expanded
                updateHeaderText()
                revalidate()
                repaint()
            }
        })

        // Wire up events
        executeButton.addActionListener { onExecute() }
        parallelismSpinner.addChangeListener {
            val value = parallelismSpinner.value as Int
            onParallelismChanged(value)
        }
    }

    fun setAvailableAgents(agents: List<String>) {
        this.availableAgents = agents
    }

    fun updateTasks(tasks: List<AgentTask>) {
        tasksContainer.removeAll()
        taskCards.clear()

        for (task in tasks) {
            val card = TaskCardPanel(task, availableAgents)
            card.onAgentChanged = { newAgent ->
                onTaskAgentChanged(task.id, newAgent)
            }
            card.onStop = {
                onTaskStop(task.id)
            }
            taskCards.add(card)
            tasksContainer.add(card)
            tasksContainer.add(Box.createVerticalStrut(2))
        }

        val done = tasks.count { it.status == AgentTaskStatus.DONE }
        executeButton.isEnabled = tasks.isNotEmpty()

        updateHeaderText(done, tasks.size)

        // Auto-expand when tasks appear
        if (tasks.isNotEmpty() && !expanded) {
            expanded = true
            scrollPane.isVisible = true
        }

        tasksContainer.revalidate()
        tasksContainer.repaint()
    }

    private fun updateHeaderText(done: Int = 0, total: Int = 0) {
        val arrow = if (expanded) "▼" else "▶"
        headerLabel.text = "$arrow TASKS  $done/$total"
    }

    fun updateActiveAgents(active: Int, total: Int) {
        agentBadge.text = "$active/$total active"
    }

    fun setParallelism(value: Int) {
        parallelismSpinner.value = value
    }

    fun setExecuteEnabled(enabled: Boolean) {
        executeButton.isEnabled = enabled
    }

    /**
     * Get a specific task card for updating its output preview.
     */
    fun getTaskCard(taskId: String): TaskCardPanel? {
        return taskCards.find { it.taskId == taskId }
    }
}

/**
 * A compact task card showing task title + agent on one line,
 * progress bar, and a small output preview area.
 */
class TaskCardPanel(
    private val task: AgentTask,
    private val availableAgents: List<String>,
) : JPanel(BorderLayout()) {

    val taskId: String = task.id

    private val progressBar = JProgressBar(0, 100).apply {
        value = task.progress
        preferredSize = Dimension(0, 3)
        isStringPainted = false
        background = JBColor(0x21262D, 0x21262D)
        foreground = JBColor(0x10B981, 0x10B981)
    }

    private val agentCombo = JComboBox<String>().apply {
        preferredSize = Dimension(120, 20)
        font = font.deriveFont(10f)
    }

    private val stopButton = JButton(AllIcons.Actions.Suspend).apply {
        toolTipText = "Stop this task"
        preferredSize = Dimension(20, 20)
        isVisible = false
        isBorderPainted = false
        isContentAreaFilled = false
    }

    // Small output preview area (3 lines)
    private val outputPreview = JTextArea(3, 40).apply {
        isEditable = false
        lineWrap = true
        wrapStyleWord = true
        background = JBColor(0x0D1117, 0x0D1117)
        foreground = JBColor(0x8B949E, 0x8B949E)
        font = Font("Monospaced", Font.PLAIN, 10)
        border = JBUI.Borders.empty(2, 4)
    }

    private val outputScroll = JScrollPane(outputPreview).apply {
        border = BorderFactory.createLineBorder(JBColor(0x21262D, 0x21262D))
        preferredSize = Dimension(0, 48)
        isVisible = false
    }

    var onAgentChanged: (String) -> Unit = {}
    var onStop: () -> Unit = {}

    init {
        isOpaque = true
        background = JBColor(0x161B22, 0x161B22)
        border = JBUI.Borders.compound(
            BorderFactory.createLineBorder(JBColor(0x21262D, 0x21262D)),
            JBUI.Borders.empty(4, 8)
        )

        // Single row: status icon + title + agent combo + stop button + status text
        val topRow = JPanel(BorderLayout()).apply {
            isOpaque = false

            val leftPanel = JPanel(FlowLayout(FlowLayout.LEFT, 4, 0)).apply {
                isOpaque = false
                add(createStatusIcon(task.status))
                add(JBLabel(task.title).apply {
                    foreground = JBColor(0xC9D1D9, 0xC9D1D9)
                    font = font.deriveFont(Font.BOLD, 11f)
                })
                add(JBLabel("·").apply { foreground = JBColor(0x30363D, 0x30363D) })
                // Agent tag inline
                add(createAgentTag(task.assignedAgent ?: "unassigned"))
                add(agentCombo)
            }
            add(leftPanel, BorderLayout.WEST)

            val rightPanel = JPanel(FlowLayout(FlowLayout.RIGHT, 2, 0)).apply {
                isOpaque = false
                add(stopButton)
                add(JBLabel(task.status.name).apply {
                    foreground = getStatusColor(task.status)
                    font = font.deriveFont(10f)
                })
            }
            add(rightPanel, BorderLayout.EAST)
        }

        // Layout
        val contentPanel = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
            add(topRow)
            add(Box.createVerticalStrut(2))
            add(progressBar)
            add(outputScroll)
        }
        add(contentPanel, BorderLayout.CENTER)

        // Wire up
        availableAgents.forEach { agentCombo.addItem(it) }
        task.assignedAgent?.let { agentCombo.selectedItem = it }
        agentCombo.addActionListener {
            val selected = agentCombo.selectedItem as? String ?: return@addActionListener
            onAgentChanged(selected)
        }
        stopButton.addActionListener { onStop() }
    }

    fun updateStatus(status: AgentTaskStatus, progress: Int) {
        progressBar.value = progress
        stopButton.isVisible = status == AgentTaskStatus.RUNNING || status == AgentTaskStatus.ACTIVE
        when (status) {
            AgentTaskStatus.RUNNING, AgentTaskStatus.ACTIVE -> {
                progressBar.foreground = JBColor(0x10B981, 0x10B981)
                outputScroll.isVisible = true
            }
            AgentTaskStatus.DONE -> {
                progressBar.foreground = JBColor(0x10B981, 0x10B981)
                progressBar.value = 100
                stopButton.isVisible = false
            }
            AgentTaskStatus.FAILED -> {
                progressBar.foreground = JBColor(0xEF4444, 0xEF4444)
                stopButton.isVisible = false
            }
            AgentTaskStatus.BLOCKED -> {
                progressBar.foreground = JBColor(0xF59E0B, 0xF59E0B)
                stopButton.isVisible = false
            }
            else -> {}
        }
        revalidate()
        repaint()
    }

    /**
     * Append output text to the preview area (streaming).
     */
    fun appendOutput(text: String) {
        if (!outputScroll.isVisible) {
            outputScroll.isVisible = true
        }
        outputPreview.append(text)
        // Keep only approximately the last few lines
        val doc = outputPreview.document
        val maxChars = 500
        if (doc.length > maxChars) {
            val removeLen = doc.length - maxChars
            doc.remove(0, removeLen)
        }
        outputPreview.caretPosition = doc.length
    }

    /**
     * Set the full output text in the preview area.
     */
    fun setOutput(text: String) {
        if (!outputScroll.isVisible) {
            outputScroll.isVisible = true
        }
        // Show last ~500 chars
        val displayText = if (text.length > 500) "…" + text.takeLast(500) else text
        outputPreview.text = displayText
        outputPreview.caretPosition = outputPreview.document.length
    }

    private fun createStatusIcon(status: AgentTaskStatus): JBLabel {
        return when (status) {
            AgentTaskStatus.DONE -> JBLabel(AllIcons.RunConfigurations.TestPassed)
            AgentTaskStatus.RUNNING -> JBLabel(AllIcons.Process.Step_1)
            AgentTaskStatus.FAILED -> JBLabel(AllIcons.RunConfigurations.TestFailed)
            AgentTaskStatus.BLOCKED -> JBLabel(AllIcons.RunConfigurations.TestIgnored)
            AgentTaskStatus.QUEUED -> JBLabel(AllIcons.RunConfigurations.TestNotRan)
            AgentTaskStatus.ACTIVE -> JBLabel(AllIcons.Process.Step_1)
        }
    }

    private fun getStatusColor(status: AgentTaskStatus): Color {
        return when (status) {
            AgentTaskStatus.DONE -> JBColor(0x10B981, 0x10B981)
            AgentTaskStatus.RUNNING, AgentTaskStatus.ACTIVE -> JBColor(0x3B82F6, 0x3B82F6)
            AgentTaskStatus.FAILED -> JBColor(0xEF4444, 0xEF4444)
            AgentTaskStatus.BLOCKED -> JBColor(0xF59E0B, 0xF59E0B)
            AgentTaskStatus.QUEUED -> JBColor(0x6B7280, 0x6B7280)
        }
    }

    private fun createAgentTag(agentId: String): JPanel {
        return JPanel(FlowLayout(FlowLayout.LEFT, 1, 0)).apply {
            isOpaque = true
            background = JBColor(0x1F6FEB, 0x1F6FEB)
            border = JBUI.Borders.empty(1, 4)
            add(JBLabel(agentId).apply {
                foreground = Color.WHITE
                font = font.deriveFont(9f)
            })
        }
    }
}
