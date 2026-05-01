////////////////////////////////////////////////////////////////////////////////

export const EMOTION_TO_ID = {
  listening: 0,
  empathetic: 1,
  happy: 2,
  curious: 3,
  surprise: 4,
} as const;

export type EmotionName = keyof typeof EMOTION_TO_ID;

export const EMOTIONS: {id: number; name: EmotionName; label: string}[] = [
  {id: 0, name: 'listening', label: 'Listening'},
  {id: 1, name: 'empathetic', label: 'Empathetic'},
  {id: 2, name: 'happy', label: 'Happy'},
  {id: 3, name: 'curious', label: 'Curious'},
  {id: 4, name: 'surprise', label: 'Surprise'},
];
