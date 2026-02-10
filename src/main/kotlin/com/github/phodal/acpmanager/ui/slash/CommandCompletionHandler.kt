package com.github.phodal.acpmanager.ui.slash

import com.intellij.openapi.diagnostic.logger
import com.intellij.ui.components.JBTextArea
import java.awt.Point
import java.awt.event.KeyEvent
import javax.swing.SwingUtilities

private val log = logger<CommandCompletionHandler>()

/**
 * Handles / command completion in the chat input area.
 * Detects / triggers, shows popup, and manages selection.
 */
class CommandCompletionHandler(
    private val inputArea: JBTextArea,
    private val registry: SlashCommandRegistry,
) {
    private var currentPopup: CommandCompletionPopup? = null
    private var commandStartPos: Int = -1

    /**
     * Handle text change in the input area.
     */
    fun handleTextChange(text: String, caretPos: Int) {
        // Find the last / before the caret
        val lastSlashPos = text.lastIndexOf('/', caretPos - 1)

        // Check if we're in a command context (/ followed by word characters)
        if (lastSlashPos >= 0 && lastSlashPos < caretPos) {
            val afterSlash = text.substring(lastSlashPos + 1, caretPos)

            // Only show popup if we have / followed by word characters or nothing
            if (afterSlash.isEmpty() || afterSlash.all { it.isLetterOrDigit() || it == '_' }) {
                commandStartPos = lastSlashPos
                showPopup(afterSlash)
                return
            }
        }

        closePopup()
    }

    /**
     * Show the command completion popup.
     */
    private fun showPopup(query: String) {
        val commands = registry.getCommandsByQuery(query)
        if (commands.isEmpty()) {
            closePopup()
            return
        }

        // Close existing popup
        currentPopup?.close()

        // Create new popup
        val popup = CommandCompletionPopup(inputArea, commands) { selected ->
            insertCommand(selected)
            closePopup()
        }

        // Position popup below the caret
        val caretPos = inputArea.caretPosition
        val caretCoords = inputArea.modelToView(caretPos)
        if (caretCoords != null) {
            val popupLocation = SwingUtilities.convertPoint(
                inputArea,
                caretCoords.x,
                caretCoords.y + caretCoords.height,
                inputArea.parent
            )
            popup.show(inputArea.parent, popupLocation.x, popupLocation.y)
        } else {
            popup.show(inputArea, 0, inputArea.height)
        }

        currentPopup = popup
    }

    /**
     * Insert the selected command into the input area.
     */
    private fun insertCommand(command: SlashCommand) {
        val text = inputArea.text
        val caretPos = inputArea.caretPosition

        // Find the command start position
        val lastSlashPos = text.lastIndexOf('/', caretPos - 1)
        if (lastSlashPos < 0) return

        // Replace from / to caret with the command
        val beforeSlash = text.substring(0, lastSlashPos)
        val afterCaret = text.substring(caretPos)
        val newText = beforeSlash + "/" + command.name + " " + afterCaret

        inputArea.text = newText
        inputArea.caretPosition = beforeSlash.length + command.name.length + 2
    }

    /**
     * Handle key press in the input area.
     * Returns true if the event was consumed by the popup.
     */
    fun handleKeyPress(e: KeyEvent): Boolean {
        if (currentPopup == null) return false

        return when (e.keyCode) {
            KeyEvent.VK_ESCAPE -> {
                closePopup()
                true
            }
            else -> false
        }
    }

    /**
     * Close the current popup.
     */
    fun closePopup() {
        currentPopup?.close()
        currentPopup = null
        commandStartPos = -1
    }
}

