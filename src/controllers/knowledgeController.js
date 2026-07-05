const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// GET ALL ARTICLES
const getArticles = async (req, res) => {
  const { category, search } = req.query;

  try {
    const where = {};

    if (category) where.category = category;

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
      ];
    }

    const articles = await prisma.knowledgeArticle.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    res.json(articles);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// GET SINGLE ARTICLE
const getArticle = async (req, res) => {
  const { id } = req.params;

  try {
    const article = await prisma.knowledgeArticle.findUnique({
      where: { id: parseInt(id) },
    });

    if (!article) {
      return res.status(404).json({ message: "Article not found" });
    }

    res.json(article);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// CREATE ARTICLE (admin only)
const createArticle = async (req, res) => {
  const { title, content, category } = req.body;

  try {
    const article = await prisma.knowledgeArticle.create({
      data: { title, content, category },
    });

    res.status(201).json(article);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// UPDATE ARTICLE (admin only)
const updateArticle = async (req, res) => {
  const { id } = req.params;
  const { title, content, category } = req.body;

  try {
    const article = await prisma.knowledgeArticle.update({
      where: { id: parseInt(id) },
      data: { title, content, category },
    });

    res.json(article);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// DELETE ARTICLE (admin only)
const deleteArticle = async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.knowledgeArticle.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: "Article deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getArticles,
  getArticle,
  createArticle,
  updateArticle,
  deleteArticle,
};