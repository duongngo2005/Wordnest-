-- Manual flashcards only require a word and Vietnamese meaning.
ALTER TABLE `flashcards`
  MODIFY `definitionEn` TEXT NULL,
  MODIFY `exampleEn` TEXT NULL,
  MODIFY `exampleVi` TEXT NULL;
