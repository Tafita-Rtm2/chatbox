// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors()); // Enable CORS for all routes

// Logging middleware to see all incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Received ${req.method} request for ${req.url}`);
  next();
});

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const HAJI_API_URL = 'https://haji-mix-api.gleeze.com/api/anthropic';
const HAJI_API_KEY = process.env.HAJI_API_KEY;
const MY_SERVER_API_KEY = process.env.MY_SERVER_API_KEY;

// --- AUTHENTICATION MIDDLEWARE ---
// This middleware checks for a valid API key in the Authorization header.
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header is missing' });
  }

  const token = authHeader.split(' ')[1];
  if (token !== MY_SERVER_API_KEY) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  next();
};

// Apply the authentication middleware to all routes that require it
app.use('/v1', authenticate);

// --- API ENDPOINTS ---

/**
 * Endpoint to list available models.
 * GET /v1/models
 * The Chatbox app calls this to get a list of models to display.
 * We will call the haji-mix-api, get the `supported_models` list,
 * and transform it into the OpenAI models list format.
 */
app.get('/v1/models', async (req, res) => {
  try {
    // Call the external API. We just need any valid call to get the model list.
    const response = await axios.get(HAJI_API_URL, {
      params: {
        ask: 'hello', // A dummy question to get a valid response
        model: 'claude-3-opus-20240229', // A default model
        api_key: HAJI_API_KEY,
      },
    });

    const supportedModels = response.data.supported_models;

    if (!supportedModels || !Array.isArray(supportedModels)) {
      throw new Error('Could not retrieve supported models from the external API.');
    }

    // Transform the list into the format expected by OpenAI-compatible clients
    const modelsData = supportedModels.map(modelId => ({
      id: modelId,
      object: 'model',
      created: Math.floor(Date.now() / 1000), // Use current timestamp
      owned_by: 'haji-mix-api', // A descriptive owner
    }));

    res.json({
      object: 'list',
      data: modelsData,
    });
  } catch (error) {
    console.error('Error fetching models:', error.message);
    res.status(500).json({ error: 'Failed to fetch models from the external API.' });
  }
});

/**
 * Endpoint for chat completions.
 * POST /v1/chat/completions
 * This is the main endpoint for chat. It receives a request in OpenAI format,
 * translates it, calls the haji-mix-api, and then translates the response back.
 */
app.post('/v1/chat/completions', async (req, res) => {
  const { model, messages, stream } = req.body;

  if (stream) {
    return res.status(400).json({ error: 'Streaming is not supported by this proxy.' });
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid or empty messages array.' });
  }

  // Find the last user message to use as the prompt
  const userMessage = messages.filter(m => m.role === 'user').pop();
  if (!userMessage || !userMessage.content) {
    return res.status(400).json({ error: 'No user message found in the request.' });
  }

  try {
    // --- 1. Call the external API ---
    console.log(`Attempting to call external API for model ${model}...`);
    const response = await axios.get(HAJI_API_URL, {
      params: {
        ask: userMessage.content,
        model: model,
        api_key: HAJI_API_KEY,
        // You can add other parameters like 'uid' here if needed
      },
      timeout: 20000 // 20-second timeout
    });
    console.log('External API call successful.');

    const apiResponse = response.data;

    // --- 2. Transform the response to OpenAI format ---
    const openAIFormattedResponse = {
      id: `chatcmpl-${Date.now()}`, // Create a unique ID
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: apiResponse.model_used,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: apiResponse.answer,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        // The haji-mix-api does not provide token usage, so we'll use placeholders.
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };

    res.json(openAIFormattedResponse);

  } catch (error) {
    console.error('Error during chat completion:', error.message);
    // Check if the error is from the external API
    if (error.response) {
      return res.status(error.response.status).json({
        error: 'An error occurred with the external API.',
        details: error.response.data
      });
    }
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
});

// --- SERVER START ---
app.listen(PORT, () => {
  console.log(`OpenAI-compatible proxy server is running on http://localhost:${PORT}`);
  if (!HAJI_API_KEY || !MY_SERVER_API_KEY) {
    console.warn('Warning: API keys are not set. Please check your .env file.');
  }
});
