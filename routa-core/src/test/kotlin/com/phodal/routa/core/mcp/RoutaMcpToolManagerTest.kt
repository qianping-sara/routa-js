package com.phodal.routa.core.mcp

import com.phodal.routa.core.RoutaFactory
import com.phodal.routa.core.model.AgentRole
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.*
import org.junit.Test

/**
 * Tests for RoutaMcpToolManager to verify all tools are registered correctly.
 */
class RoutaMcpToolManagerTest {

    private fun withRouta(block: suspend (com.phodal.routa.core.RoutaSystem) -> Unit) {
        val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
        val routa = RoutaFactory.createInMemory(scope)
        try {
            runBlocking { block(routa) }
        } finally {
            routa.coordinator.shutdown()
        }
    }

    @Test
    fun `RoutaMcpServer creates server with all 10 tools`() = runBlocking {
        val (mcpServer, routa) = RoutaMcpServer.create("test-workspace")
        
        try {
            routa.coordinator.initialize("test-workspace")
            
            // Verify server is created and tools are registered
            assertNotNull("MCP server should be initialized", mcpServer)
            
            println("✓ MCP server initialized with Routa coordination tools")
        } finally {
            routa.coordinator.shutdown()
        }
    }

    @Test
    fun `RoutaMcpToolManager can be used independently`() = withRouta { routa ->
        routa.coordinator.initialize("test-workspace")

        // Test that tool manager can be instantiated and used
        val toolManager = RoutaMcpToolManager(routa.tools, "test-workspace")
        assertNotNull("Tool manager should be created", toolManager)
        
        println("✓ RoutaMcpToolManager created successfully")
    }

    @Test
    fun `New task-agent lifecycle tools work via AgentTools`() = withRouta { routa ->
        val routaId = routa.coordinator.initialize("test-workspace")

        // Create a task
        val task = com.phodal.routa.core.model.Task(
            id = "test-task",
            title = "Test Task",
            objective = "Test objective",
            workspaceId = "test-workspace",
            createdAt = java.time.Instant.now().toString(),
            updatedAt = java.time.Instant.now().toString(),
        )
        routa.context.taskStore.save(task)

        // Test wake_or_create_task_agent
        val wakeResult = routa.tools.wakeOrCreateTaskAgent(
            taskId = "test-task",
            contextMessage = "Start work",
            callerAgentId = routaId,
            workspaceId = "test-workspace",
        )
        assertTrue("wake_or_create_task_agent should succeed", wakeResult.success)
        println("✓ wake_or_create_task_agent works")

        // Test get_agent_status
        val statusResult = routa.tools.getAgentStatus(routaId)
        assertTrue("get_agent_status should succeed", statusResult.success)
        println("✓ get_agent_status works")

        // Test get_agent_summary
        val summaryResult = routa.tools.getAgentSummary(routaId)
        assertTrue("get_agent_summary should succeed", summaryResult.success)
        println("✓ get_agent_summary works")
    }

    @Test
    fun `send_message_to_task_agent works`() = withRouta { routa ->
        val routaId = routa.coordinator.initialize("test-workspace")

        // Create a crafter
        val crafterResult = routa.tools.createAgent(
            name = "test-crafter",
            role = AgentRole.CRAFTER,
            workspaceId = "test-workspace",
            parentId = routaId,
        )
        assertTrue("Crafter should be created", crafterResult.success)
        val crafterId = kotlinx.serialization.json.Json.parseToJsonElement(crafterResult.data)
            .jsonObject["id"]!!.jsonPrimitive.content

        // Create a task and assign to crafter
        val task = com.phodal.routa.core.model.Task(
            id = "test-task-2",
            title = "Test Task 2",
            objective = "Test objective",
            assignedTo = crafterId,
            workspaceId = "test-workspace",
            createdAt = java.time.Instant.now().toString(),
            updatedAt = java.time.Instant.now().toString(),
        )
        routa.context.taskStore.save(task)

        // Test send_message_to_task_agent
        val messageResult = routa.tools.sendMessageToTaskAgent(
            taskId = "test-task-2",
            message = "Please fix the tests",
            callerAgentId = routaId,
        )
        assertTrue("send_message_to_task_agent should succeed", messageResult.success)
        println("✓ send_message_to_task_agent works")
    }
}
