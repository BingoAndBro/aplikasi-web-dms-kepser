---
name: error-handling-patterns
description: Master error handling patterns across languages including exceptions, Result types, error propagation, and graceful degradation to build resilient applications. Use when implementing error handling, designing APIs, or improving application reliability.
---

# Error Handling Patterns

Build resilient applications with robust error handling strategies that gracefully handle failures and provide excellent debugging experiences.

## When to use this skill
- Implementing error handling in new features
- Designing error-resilient APIs
- Debugging production issues
- Improving application reliability
- Creating better error messages for users and developers
- Implementing retry and circuit breaker patterns
- Handling async/concurrent errors
- Building fault-tolerant distributed systems

## Workflow
- [ ] Identify if the error is recoverable or unrecoverable
- [ ] Determine the appropriate error handling philosophy (Exceptions, Result Types, etc.)
- [ ] Implement the pattern using language-specific idiomatic structures
- [ ] Add necessary context, stack traces, and meaningful messages
- [ ] Verify that resources are cleaned up properly

## Instructions

### 1. Error Handling Philosophies
- **Exceptions**: Traditional try-catch, disrupts control flow. Use for unexpected errors, exceptional conditions.
- **Result Types**: Explicit success/failure, functional approach. Use for expected errors, validation failures.
- **Error Codes**: C-style, requires discipline.
- **Option/Maybe Types**: For nullable values.
- **Panics/Crashes**: Use for unrecoverable errors, programming bugs.

### 2. Error Categories
- **Recoverable Errors**: Network timeouts, missing files, invalid user input, API rate limits.
- **Unrecoverable Errors**: Out of memory, stack overflow, programming bugs (null pointer, etc.).

### Universal Patterns
- **Pattern 1: Circuit Breaker**: Prevent cascading failures in distributed systems. Use failure thresholds, timeouts, and success thresholds.
- **Pattern 2: Error Aggregation**: Collect multiple errors instead of failing on first error (e.g., in validation).
- **Pattern 3: Graceful Degradation**: Provide fallback functionality when errors occur.

## Best Practices
- **Fail Fast**: Validate input early, fail quickly
- **Preserve Context**: Include stack traces, metadata, timestamps
- **Meaningful Messages**: Explain what happened and how to fix it
- **Log Appropriately**: Error = log, expected failure = don't spam logs
- **Handle at Right Level**: Catch where you can meaningfully handle
- **Clean Up Resources**: Use try-finally, context managers, deferred execution
- **Don't Swallow Errors**: Log or re-throw, don't silently ignore
- **Type-Safe Errors**: Use typed errors when possible

## Common Pitfalls
- **Catching Too Broadly**: catching generic exceptions hides bugs
- **Empty Catch Blocks**: silently swallowing errors
- **Logging and Re-throwing**: creates duplicate log entries
- **Not Cleaning Up**: forgetting to close files, connections
- **Poor Error Messages**: "Error occurred" is not helpful
- **Returning Error Codes**: when exceptions or Result types are available
- **Ignoring Async Errors**: unhandled promise rejections
