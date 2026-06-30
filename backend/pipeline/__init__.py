"""The generation pipeline: repo -> file selection -> prompt -> LLM -> tests.

Each stage is small and independent so it can be measured and swapped on its own
(the "treat each component as a measured step" idea from the execution plan).
"""
