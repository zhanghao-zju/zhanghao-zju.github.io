export type PetMood =
  | 'neutral'
  | 'happy'
  | 'curious'
  | 'surprised'
  | 'relaxed'
  | 'playful'
  | 'sleepy'
  | 'annoyed';

export type PetState =
  | 'idle'
  | 'attentive'
  | 'speaking'
  | 'playing'
  | 'reacting'
  | 'sleepy'
  | 'hidden';

export type PetTrigger =
  | 'first-visit'
  | 'tab-return'
  | 'pet-head'
  | 'pet-nose'
  | 'rapid-click'
  | 'toy-start'
  | 'toy-end'
  | 'recall'
  | 'idle'
  | 'page-blog'
  | 'page-projects'
  | 'page-about';

export interface PetLine {
  id: string;
  trigger: PetTrigger;
  text: string;
  mood: PetMood;
  weight: number;
  minIntervalMs: number;
  paths: string[];
}

export interface SpeechRequest {
  trigger: PetTrigger;
  priority: number;
  announce?: boolean;
}

export interface StateLease {
  id: number;
  state: PetState;
  priority: number;
}
