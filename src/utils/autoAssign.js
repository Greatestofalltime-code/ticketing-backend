const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const autoAssignAgent = async () => {
  // Get all agents
  const agents = await prisma.user.findMany({
    where: { role: "agent" },
  });

  if (agents.length === 0) {
    return null; // no agents available
  }

  // Count active tickets (open or in_progress) for each agent
  const agentWorkloads = await Promise.all(
    agents.map(async (agent) => {
      const activeTicketCount = await prisma.ticket.count({
        where: {
          assignedAgentId: agent.id,
          status: { in: ["open", "in_progress"] },
        },
      });
      return { agent, activeTicketCount };
    })
  );

  // Sort by workload — fewest tickets first
  agentWorkloads.sort((a, b) => a.activeTicketCount - b.activeTicketCount);

  // Return the agent with the lightest workload
  return agentWorkloads[0].agent;
};

module.exports = autoAssignAgent;