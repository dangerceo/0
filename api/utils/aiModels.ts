import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { LanguageModelV1 } from "ai";
import { SupportedModel as ImportedSupportedModel, DEFAULT_AI_MODEL } from "../../src/types/aiModels";

// Re-export the type
export type SupportedModel = ImportedSupportedModel;

export const DEFAULT_MODEL = DEFAULT_AI_MODEL;

// Factory that returns a LanguageModelV1 instance for the requested model
export const getModelInstance = (model: SupportedModel): LanguageModelV1 => {
  const modelToUse: SupportedModel = model ?? DEFAULT_MODEL;

  switch (modelToUse) {
    case "gpt-4o":
      return openai("gpt-4o");
    case "gpt-4.1":
      return openai("gpt-4.1");
    case "gpt-4.1-mini":
      return openai("gpt-4.1-mini");
    case "gemini-2.5-flash":
      return google("gemini-2.5-flash");
    case "gemini-2.5-pro-preview-05-06":
      return google("gemini-2.5-pro-preview-05-06");
    case "claude-3.7":
      return anthropic("claude-3-7-sonnet-20250219");
    case "claude-3.5":
      return anthropic("claude-3-5-sonnet-20241022");
    default:
      // Fallback – should never happen due to exhaustive switch
      return openai("gpt-4.1");
  }
}; 