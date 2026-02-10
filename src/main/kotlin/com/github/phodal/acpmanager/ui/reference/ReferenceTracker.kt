package com.github.phodal.acpmanager.ui.reference

import com.github.phodal.acpmanager.ui.mention.MentionItem
import com.github.phodal.acpmanager.ui.mention.MentionType

/**
 * Represents a reference to a file or symbol in a message.
 */
data class Reference(
    val type: MentionType,
    val displayText: String,
    val insertText: String,
    val metadata: Map<String, Any> = emptyMap()
) {
    /**
     * Get the file path for this reference (if it's a file reference).
     */
    val filePath: String?
        get() = if (type == MentionType.FILE) metadata["path"] as? String else null

    /**
     * Get the line number for this reference (if it's a symbol reference).
     */
    val lineNumber: Int?
        get() = (metadata["lineNumber"] as? Number)?.toInt()

    /**
     * Get the symbol kind (class, method, etc.) for this reference.
     */
    val symbolKind: String?
        get() = metadata["kind"] as? String

    companion object {
        /**
         * Create a Reference from a MentionItem.
         */
        fun fromMentionItem(item: MentionItem): Reference {
            return Reference(
                type = item.type,
                displayText = item.displayText,
                insertText = item.insertText,
                metadata = item.metadata
            )
        }
    }
}

/**
 * Tracks references in messages.
 * Extracts references from message text and provides utilities for managing them.
 */
object ReferenceTracker {
    /**
     * Extract references from message text.
     * Looks for patterns like @filename or @symbol:lineNumber
     */
    fun extractReferences(text: String, insertedReferences: List<Reference> = emptyList()): List<Reference> {
        // For now, return the explicitly inserted references
        // In the future, we could also parse the text to find references
        return insertedReferences
    }

    /**
     * Check if text contains any references.
     */
    fun hasReferences(text: String): Boolean {
        return text.contains("@") || text.contains(":")
    }

    /**
     * Get all file references from a list of references.
     */
    fun getFileReferences(references: List<Reference>): List<Reference> {
        return references.filter { it.type == MentionType.FILE }
    }

    /**
     * Get all symbol references from a list of references.
     */
    fun getSymbolReferences(references: List<Reference>): List<Reference> {
        return references.filter { it.type == MentionType.SYMBOL }
    }
}

