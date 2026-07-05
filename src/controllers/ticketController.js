const { PrismaClient } = require("@prisma/client");
const autoAssignAgent = require("../utils/autoAssign");
const sendEmail = require("../utils/sendEmail");

const prisma = new PrismaClient();

// CREATE TICKET
const createTicket = async (req, res) => {
  const { title, description, priority, category } = req.body;

  try {
    // Auto-assign to agent with fewest active tickets
    const assignedAgent = await autoAssignAgent();

    const ticket = await prisma.ticket.create({
      data: {
        title,
        description,
        priority: priority || "medium",
        category,
        customerId: req.user.id,
        assignedAgentId: assignedAgent ? assignedAgent.id : null,
      },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        assignedAgent: { select: { id: true, name: true, email: true } },
      },
    });

    // Notify assigned agent via email
    if (assignedAgent) {
      await sendEmail(
        assignedAgent.email,
        `New Ticket Assigned: #${ticket.id}`,
        `
          <h2>New Ticket Assigned to You</h2>
          <p>Hi ${assignedAgent.name},</p>
          <p>A new ticket has been assigned to you:</p>
          <table style="border-collapse:collapse;width:100%">
            <tr>
              <td style="padding:8px;border:1px solid #ddd"><strong>Ticket ID</strong></td>
              <td style="padding:8px;border:1px solid #ddd">#${ticket.id}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #ddd"><strong>Title</strong></td>
              <td style="padding:8px;border:1px solid #ddd">${ticket.title}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #ddd"><strong>Priority</strong></td>
              <td style="padding:8px;border:1px solid #ddd">${ticket.priority}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #ddd"><strong>Category</strong></td>
              <td style="padding:8px;border:1px solid #ddd">${ticket.category}</td>
            </tr>
          </table>
          <a href="${process.env.FRONTEND_URL}/tickets/${ticket.id}" 
             style="background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:16px;">
            View Ticket
          </a>
        `
      );

      // Create in-app notification for agent
      await prisma.notification.create({
        data: {
          userId: assignedAgent.id,
          message: `New ticket assigned: "${ticket.title}"`,
          type: "ticket_assigned",
          link: `/tickets/${ticket.id}`,
        },
      });
    }

    // Create in-app notification for customer
    await prisma.notification.create({
      data: {
        userId: req.user.id,
        message: `Your ticket "#${ticket.id} - ${ticket.title}" has been created and assigned.`,
        type: "ticket_created",
        link: `/tickets/${ticket.id}`,
      },
    });

    res.status(201).json(ticket);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// GET ALL TICKETS
const getTickets = async (req, res) => {
  const { status, priority, category, search, assignedAgentId } = req.query;

  try {
    const where = {};

    // Customers only see their own tickets
    if (req.user.role === "customer") {
      where.customerId = req.user.id;
    }

    // Agents see all tickets but can filter to their own
    if (req.user.role === "agent" && assignedAgentId === "me") {
      where.assignedAgentId = req.user.id;
    }

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (category) where.category = category;

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        assignedAgent: { select: { id: true, name: true, email: true } },
        comments: { select: { id: true } },
        attachments: { select: { id: true } },
      },
    });

    const ticketsWithCount = tickets.map((ticket) => ({
      ...ticket,
      commentCount: ticket.comments.length,
      attachmentCount: ticket.attachments.length,
      comments: undefined,
      attachments: undefined,
    }));

    res.json(ticketsWithCount);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// GET SINGLE TICKET
const getTicket = async (req, res) => {
  const { id } = req.params;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(id) },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        assignedAgent: { select: { id: true, name: true, email: true } },
        comments: {
          include: {
            user: { select: { id: true, name: true, role: true, avatar: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        attachments: {
          include: {
            uploadedBy: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Customers can only view their own tickets
    if (
      req.user.role === "customer" &&
      ticket.customerId !== req.user.id
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(ticket);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// UPDATE TICKET STATUS
const updateTicketStatus = async (req, res) => {
  const { id } = req.params;
  const { status, priority, assignedAgentId } = req.body;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(id) },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        assignedAgent: { select: { id: true, name: true, email: true } },
      },
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    const updateData = {};
    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    if (assignedAgentId !== undefined) {
      updateData.assignedAgentId = assignedAgentId
        ? parseInt(assignedAgentId)
        : null;
    }

    // Set resolvedAt when ticket is resolved or closed
    if (status === "resolved" || status === "closed") {
      updateData.resolvedAt = new Date();
    }

    // Clear resolvedAt if ticket is reopened
    if (status === "open" || status === "in_progress") {
      updateData.resolvedAt = null;
    }

    const updatedTicket = await prisma.ticket.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        customer: { select: { id: true, name: true, email: true } },
        assignedAgent: { select: { id: true, name: true, email: true } },
      },
    });

    // Notify customer of status change
    if (status && status !== ticket.status) {
      await sendEmail(
        ticket.customer.email,
        `Ticket #${ticket.id} Status Updated`,
        `
          <h2>Your Ticket Status Has Been Updated</h2>
          <p>Hi ${ticket.customer.name},</p>
          <p>Your ticket <strong>#${ticket.id} - ${ticket.title}</strong> 
          has been updated.</p>
          <p>
            <strong>Previous Status:</strong> ${ticket.status}<br/>
            <strong>New Status:</strong> ${status}
          </p>
          <a href="${process.env.FRONTEND_URL}/tickets/${ticket.id}"
             style="background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:16px;">
            View Ticket
          </a>
        `
      );

      // In-app notification for customer
      await prisma.notification.create({
        data: {
          userId: ticket.customerId,
          message: `Ticket #${ticket.id} status changed to "${status}"`,
          type: "ticket_updated",
          link: `/tickets/${ticket.id}`,
        },
      });
    }

    // Notify new agent if reassigned
    if (
      assignedAgentId &&
      assignedAgentId !== ticket.assignedAgentId
    ) {
      const newAgent = await prisma.user.findUnique({
        where: { id: parseInt(assignedAgentId) },
      });

      if (newAgent) {
        await sendEmail(
          newAgent.email,
          `Ticket #${ticket.id} Assigned to You`,
          `
            <h2>Ticket Reassigned to You</h2>
            <p>Hi ${newAgent.name},</p>
            <p>Ticket <strong>#${ticket.id} - ${ticket.title}</strong> 
            has been assigned to you.</p>
            <a href="${process.env.FRONTEND_URL}/tickets/${ticket.id}"
               style="background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:16px;">
              View Ticket
            </a>
          `
        );

        await prisma.notification.create({
          data: {
            userId: parseInt(assignedAgentId),
            message: `Ticket #${ticket.id} has been assigned to you`,
            type: "ticket_assigned",
            link: `/tickets/${ticket.id}`,
          },
        });
      }
    }

    res.json(updatedTicket);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// DELETE TICKET (admin only)
const deleteTicket = async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.ticket.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: "Ticket deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// GET DASHBOARD STATS (admin)
const getDashboardStats = async (req, res) => {
  try {
    const [
      totalTickets,
      openTickets,
      inProgressTickets,
      resolvedTickets,
      closedTickets,
      urgentTickets,
      totalCustomers,
      totalAgents,
    ] = await Promise.all([
      prisma.ticket.count(),
      prisma.ticket.count({ where: { status: "open" } }),
      prisma.ticket.count({ where: { status: "in_progress" } }),
      prisma.ticket.count({ where: { status: "resolved" } }),
      prisma.ticket.count({ where: { status: "closed" } }),
      prisma.ticket.count({ where: { priority: "urgent" } }),
      prisma.user.count({ where: { role: "customer" } }),
      prisma.user.count({ where: { role: "agent" } }),
    ]);

    // Agent workload
    const agents = await prisma.user.findMany({
      where: { role: "agent" },
      select: {
        id: true,
        name: true,
        ticketsAssigned: {
          where: { status: { in: ["open", "in_progress"] } },
          select: { id: true },
        },
      },
    });

    const agentWorkload = agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      activeTickets: agent.ticketsAssigned.length,
    }));

    // Recent tickets
    const recentTickets = await prisma.ticket.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { name: true } },
        assignedAgent: { select: { name: true } },
      },
    });

    res.json({
      stats: {
        totalTickets,
        openTickets,
        inProgressTickets,
        resolvedTickets,
        closedTickets,
        urgentTickets,
        totalCustomers,
        totalAgents,
      },
      agentWorkload,
      recentTickets,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  createTicket,
  getTickets,
  getTicket,
  updateTicketStatus,
  deleteTicket,
  getDashboardStats,
};