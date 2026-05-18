import OpenAI from 'openai';
import { EnvLoader } from '@gigav2/lib/env';

export const openai = new OpenAI({
  apiKey: EnvLoader.getOrThrow('OPENAI_API_KEY'),
});
