# CMAKE generated file: DO NOT EDIT!
# Generated by "MinGW Makefiles" Generator, CMake Version 3.19

# Delete rule output on recipe failure.
.DELETE_ON_ERROR:


#=============================================================================
# Special targets provided by cmake.

# Disable implicit rules so canonical targets will work.
.SUFFIXES:


# Disable VCS-based implicit rules.
% : %,v


# Disable VCS-based implicit rules.
% : RCS/%


# Disable VCS-based implicit rules.
% : RCS/%,v


# Disable VCS-based implicit rules.
% : SCCS/s.%


# Disable VCS-based implicit rules.
% : s.%


.SUFFIXES: .hpux_make_needs_suffix_list


# Command-line flag to silence nested $(MAKE).
$(VERBOSE)MAKESILENT = -s

#Suppress display of executed commands.
$(VERBOSE).SILENT:

# A target that is always out of date.
cmake_force:

.PHONY : cmake_force

#=============================================================================
# Set environment variables for the build.

SHELL = cmd.exe

# The CMake executable.
CMAKE_COMMAND = "C:\Program Files\JetBrains\CLion 2021.1.2\bin\cmake\win\bin\cmake.exe"

# The command to remove a file.
RM = "C:\Program Files\JetBrains\CLion 2021.1.2\bin\cmake\win\bin\cmake.exe" -E rm -f

# Escaping for special characters.
EQUALS = =

# The top-level source directory on which CMake was run.
CMAKE_SOURCE_DIR = C:\Users\a2882\Documents\Code\PDF_Tool

# The top-level build directory on which CMake was run.
CMAKE_BINARY_DIR = C:\Users\a2882\Documents\Code\PDF_Tool\cmake-build-release

# Utility rule file for PDF_Tool_autogen.

# Include the progress variables for this target.
include CMakeFiles/PDF_Tool_autogen.dir/progress.make

CMakeFiles/PDF_Tool_autogen:
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --blue --bold --progress-dir=C:\Users\a2882\Documents\Code\PDF_Tool\cmake-build-release\CMakeFiles --progress-num=$(CMAKE_PROGRESS_1) "Automatic MOC and UIC for target PDF_Tool"
	"C:\Program Files\JetBrains\CLion 2021.1.2\bin\cmake\win\bin\cmake.exe" -E cmake_autogen C:/Users/a2882/Documents/Code/PDF_Tool/cmake-build-release/CMakeFiles/PDF_Tool_autogen.dir/AutogenInfo.json Release

PDF_Tool_autogen: CMakeFiles/PDF_Tool_autogen
PDF_Tool_autogen: CMakeFiles/PDF_Tool_autogen.dir/build.make

.PHONY : PDF_Tool_autogen

# Rule to build all files generated by this target.
CMakeFiles/PDF_Tool_autogen.dir/build: PDF_Tool_autogen

.PHONY : CMakeFiles/PDF_Tool_autogen.dir/build

CMakeFiles/PDF_Tool_autogen.dir/clean:
	$(CMAKE_COMMAND) -P CMakeFiles\PDF_Tool_autogen.dir\cmake_clean.cmake
.PHONY : CMakeFiles/PDF_Tool_autogen.dir/clean

CMakeFiles/PDF_Tool_autogen.dir/depend:
	$(CMAKE_COMMAND) -E cmake_depends "MinGW Makefiles" C:\Users\a2882\Documents\Code\PDF_Tool C:\Users\a2882\Documents\Code\PDF_Tool C:\Users\a2882\Documents\Code\PDF_Tool\cmake-build-release C:\Users\a2882\Documents\Code\PDF_Tool\cmake-build-release C:\Users\a2882\Documents\Code\PDF_Tool\cmake-build-release\CMakeFiles\PDF_Tool_autogen.dir\DependInfo.cmake --color=$(COLOR)
.PHONY : CMakeFiles/PDF_Tool_autogen.dir/depend

