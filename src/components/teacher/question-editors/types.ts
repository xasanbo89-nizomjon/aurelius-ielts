export type QuestionEditorProps<TOptions, TAnswer> = {
  options: TOptions;
  correctAnswer: TAnswer;
  onChange: (options: TOptions, correctAnswer: TAnswer) => void;
};
