```markdown
# AGENTS.md File Guidelines

These guidelines are designed to ensure the consistent, maintainable, and high-quality development of AGENTS.md. Adherence to these principles is crucial for the success of this project.

## 1. DRY (Don't Repeat Yourself)

*   All code within the repository should be self-contained and reusable.
*   Avoid duplicating logic and components.
*   When a similar concept emerges, consider creating a reusable component or module.
*   Refactor existing code to eliminate redundancies.

## 2. KISS (Keep It Simple, Stupid)

*   Prioritize code clarity and readability.
*   Avoid overly complex logic.
*   Use the simplest solution that meets the requirements.
*   Minimize unnecessary complexity.

## 3. SOLID Principles

*   **Single Responsibility Principle:** Each class/module should have one, and only one, well-defined responsibility.
*   **Open/Closed Principle:**  The system should be extensible without modifying the core logic.  New functionality should be added via new classes/modules.
*   **Liskov Substitution Principle:**  Subclasses should be substitutable for their base classes without altering the correctness of the program.
*   **Interface Segregation Principle:** Client code should not be forced to depend on methods it does not use.
*   **Dependency Inversion Principle:**  High-level modules should be dependent on low-level modules, not vice versa.

## 4. YAGNI (You Aren't Gonna Need It)

*   Avoid adding functionality that is not currently required.
*   Only implement features that are explicitly necessary for the current task.
*   Focus on delivering working code, not premature optimizations.
*   Refactor code to eliminate unnecessary features before implementation.

## 5. Development Workflow

*   **Commit Frequency:** Commit changes frequently (e.g., every 24 hours).
*   **Small, Focused Changes:** Each commit should address a single, well-defined issue.
*   **Descriptive Commit Messages:** Provide clear and concise commit messages explaining the change.
*   **Code Review:**  All changes should be reviewed by at least one other developer.
*   **Testing:** Comprehensive unit and integration tests are mandatory for all code changes.
*   **Documentation:**  Update relevant documentation as needed to reflect changes.

## 6. Code Style & Formatting

*   **Indentation:** Use 2 spaces for indentation.
*   **Line Length:** Maximum 80 lines per file.
*   **Naming Conventions:** Follow established naming conventions for variables, functions, and classes.
*   **Comments:**  Write clear and concise comments where appropriate. Comments should explain *why* not *what*.
*   **Whitespace:** Use consistent whitespace around operators and after commas.

## 7. Test Coverage (80%+)

*   All code should be thoroughly tested with unit tests.
*   Test cases should cover all critical functionality.
*   Tests should verify expected behavior and edge cases.
*   Maintainable test code is crucial.

## 8. File Size Limit (180 Lines)

*   Each file should not exceed 180 lines of code.

## 9.  Specific Considerations

*   **Data Structures:** Define clear and consistent data structures.
*   **Algorithms:**  Favor efficient algorithms.
*   **Error Handling:** Implement robust error handling.
*   **Logging:** Utilize logging to provide informative debugging information.

## 10.  Tools & Technologies

*   [Specify Dependencies/Frameworks Here]
*   [Version Control System: Git]
*   [IDE:  e.g., VS Code, IntelliJ]

These guidelines are essential for maintaining the quality and stability of AGENTS.md.  Ongoing adherence to these principles is vital for the long-term success of this project.
```