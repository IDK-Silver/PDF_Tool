# CMAKE generated file: DO NOT EDIT!
# Generated by "MinGW Makefiles" Generator, CMake Version 3.20

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
CMAKE_COMMAND = "C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe"

# The command to remove a file.
RM = "C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E rm -f

# Escaping for special characters.
EQUALS = =

# The top-level source directory on which CMake was run.
CMAKE_SOURCE_DIR = C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool

# The top-level build directory on which CMake was run.
CMAKE_BINARY_DIR = C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\cmake-build-debug

# Include any dependencies generated for this target.
include CMakeFiles/PDF_Tool.dir/depend.make
# Include the progress variables for this target.
include CMakeFiles/PDF_Tool.dir/progress.make

# Include the compile flags for this target's objects.
include CMakeFiles/PDF_Tool.dir/flags.make

PDF_Tool_autogen/6WJNPILU4A/qrc_resource.cpp: ../resource/resource.qrc
PDF_Tool_autogen/6WJNPILU4A/qrc_resource.cpp: CMakeFiles/PDF_Tool_autogen.dir/AutoRcc_resource_6WJNPILU4A_Info.json
PDF_Tool_autogen/6WJNPILU4A/qrc_resource.cpp: ../resource/app-icon.ico
PDF_Tool_autogen/6WJNPILU4A/qrc_resource.cpp: C:/Development/Qt/5.15.2/mingw81_64/bin/rcc.exe
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --blue --bold --progress-dir=C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\cmake-build-debug\CMakeFiles --progress-num=$(CMAKE_PROGRESS_1) "Automatic RCC for resource/resource.qrc"
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E cmake_autorcc C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug/CMakeFiles/PDF_Tool_autogen.dir/AutoRcc_resource_6WJNPILU4A_Info.json Debug

CMakeFiles/PDF_Tool.dir/PDF_Tool_autogen/mocs_compilation.cpp.obj: CMakeFiles/PDF_Tool.dir/flags.make
CMakeFiles/PDF_Tool.dir/PDF_Tool_autogen/mocs_compilation.cpp.obj: CMakeFiles/PDF_Tool.dir/includes_CXX.rsp
CMakeFiles/PDF_Tool.dir/PDF_Tool_autogen/mocs_compilation.cpp.obj: PDF_Tool_autogen/mocs_compilation.cpp
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green --progress-dir=C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\cmake-build-debug\CMakeFiles --progress-num=$(CMAKE_PROGRESS_2) "Building CXX object CMakeFiles/PDF_Tool.dir/PDF_Tool_autogen/mocs_compilation.cpp.obj"
	C:\Development\Qt\Tools\mingw810_64\bin\g++.exe $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -o CMakeFiles\PDF_Tool.dir\PDF_Tool_autogen\mocs_compilation.cpp.obj -c C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\cmake-build-debug\PDF_Tool_autogen\mocs_compilation.cpp

CMakeFiles/PDF_Tool.dir/PDF_Tool_autogen/mocs_compilation.cpp.i: cmake_force
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green "Preprocessing CXX source to CMakeFiles/PDF_Tool.dir/PDF_Tool_autogen/mocs_compilation.cpp.i"
	C:\Development\Qt\Tools\mingw810_64\bin\g++.exe $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -E C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\cmake-build-debug\PDF_Tool_autogen\mocs_compilation.cpp > CMakeFiles\PDF_Tool.dir\PDF_Tool_autogen\mocs_compilation.cpp.i

CMakeFiles/PDF_Tool.dir/PDF_Tool_autogen/mocs_compilation.cpp.s: cmake_force
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green "Compiling CXX source to assembly CMakeFiles/PDF_Tool.dir/PDF_Tool_autogen/mocs_compilation.cpp.s"
	C:\Development\Qt\Tools\mingw810_64\bin\g++.exe $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -S C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\cmake-build-debug\PDF_Tool_autogen\mocs_compilation.cpp -o CMakeFiles\PDF_Tool.dir\PDF_Tool_autogen\mocs_compilation.cpp.s

CMakeFiles/PDF_Tool.dir/src/main.cpp.obj: CMakeFiles/PDF_Tool.dir/flags.make
CMakeFiles/PDF_Tool.dir/src/main.cpp.obj: CMakeFiles/PDF_Tool.dir/includes_CXX.rsp
CMakeFiles/PDF_Tool.dir/src/main.cpp.obj: ../src/main.cpp
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green --progress-dir=C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\cmake-build-debug\CMakeFiles --progress-num=$(CMAKE_PROGRESS_3) "Building CXX object CMakeFiles/PDF_Tool.dir/src/main.cpp.obj"
	C:\Development\Qt\Tools\mingw810_64\bin\g++.exe $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -o CMakeFiles\PDF_Tool.dir\src\main.cpp.obj -c C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\src\main.cpp

CMakeFiles/PDF_Tool.dir/src/main.cpp.i: cmake_force
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green "Preprocessing CXX source to CMakeFiles/PDF_Tool.dir/src/main.cpp.i"
	C:\Development\Qt\Tools\mingw810_64\bin\g++.exe $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -E C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\src\main.cpp > CMakeFiles\PDF_Tool.dir\src\main.cpp.i

CMakeFiles/PDF_Tool.dir/src/main.cpp.s: cmake_force
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green "Compiling CXX source to assembly CMakeFiles/PDF_Tool.dir/src/main.cpp.s"
	C:\Development\Qt\Tools\mingw810_64\bin\g++.exe $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -S C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\src\main.cpp -o CMakeFiles\PDF_Tool.dir\src\main.cpp.s

CMakeFiles/PDF_Tool.dir/src/Widget/MainWindow/MainWindow.cpp.obj: CMakeFiles/PDF_Tool.dir/flags.make
CMakeFiles/PDF_Tool.dir/src/Widget/MainWindow/MainWindow.cpp.obj: CMakeFiles/PDF_Tool.dir/includes_CXX.rsp
CMakeFiles/PDF_Tool.dir/src/Widget/MainWindow/MainWindow.cpp.obj: ../src/Widget/MainWindow/MainWindow.cpp
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green --progress-dir=C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\cmake-build-debug\CMakeFiles --progress-num=$(CMAKE_PROGRESS_4) "Building CXX object CMakeFiles/PDF_Tool.dir/src/Widget/MainWindow/MainWindow.cpp.obj"
	C:\Development\Qt\Tools\mingw810_64\bin\g++.exe $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -o CMakeFiles\PDF_Tool.dir\src\Widget\MainWindow\MainWindow.cpp.obj -c C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\src\Widget\MainWindow\MainWindow.cpp

CMakeFiles/PDF_Tool.dir/src/Widget/MainWindow/MainWindow.cpp.i: cmake_force
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green "Preprocessing CXX source to CMakeFiles/PDF_Tool.dir/src/Widget/MainWindow/MainWindow.cpp.i"
	C:\Development\Qt\Tools\mingw810_64\bin\g++.exe $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -E C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\src\Widget\MainWindow\MainWindow.cpp > CMakeFiles\PDF_Tool.dir\src\Widget\MainWindow\MainWindow.cpp.i

CMakeFiles/PDF_Tool.dir/src/Widget/MainWindow/MainWindow.cpp.s: cmake_force
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green "Compiling CXX source to assembly CMakeFiles/PDF_Tool.dir/src/Widget/MainWindow/MainWindow.cpp.s"
	C:\Development\Qt\Tools\mingw810_64\bin\g++.exe $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -S C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\src\Widget\MainWindow\MainWindow.cpp -o CMakeFiles\PDF_Tool.dir\src\Widget\MainWindow\MainWindow.cpp.s

CMakeFiles/PDF_Tool.dir/src/Widget/PDFWidget/PDFWidget.cpp.obj: CMakeFiles/PDF_Tool.dir/flags.make
CMakeFiles/PDF_Tool.dir/src/Widget/PDFWidget/PDFWidget.cpp.obj: CMakeFiles/PDF_Tool.dir/includes_CXX.rsp
CMakeFiles/PDF_Tool.dir/src/Widget/PDFWidget/PDFWidget.cpp.obj: ../src/Widget/PDFWidget/PDFWidget.cpp
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green --progress-dir=C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\cmake-build-debug\CMakeFiles --progress-num=$(CMAKE_PROGRESS_5) "Building CXX object CMakeFiles/PDF_Tool.dir/src/Widget/PDFWidget/PDFWidget.cpp.obj"
	C:\Development\Qt\Tools\mingw810_64\bin\g++.exe $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -o CMakeFiles\PDF_Tool.dir\src\Widget\PDFWidget\PDFWidget.cpp.obj -c C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\src\Widget\PDFWidget\PDFWidget.cpp

CMakeFiles/PDF_Tool.dir/src/Widget/PDFWidget/PDFWidget.cpp.i: cmake_force
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green "Preprocessing CXX source to CMakeFiles/PDF_Tool.dir/src/Widget/PDFWidget/PDFWidget.cpp.i"
	C:\Development\Qt\Tools\mingw810_64\bin\g++.exe $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -E C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\src\Widget\PDFWidget\PDFWidget.cpp > CMakeFiles\PDF_Tool.dir\src\Widget\PDFWidget\PDFWidget.cpp.i

CMakeFiles/PDF_Tool.dir/src/Widget/PDFWidget/PDFWidget.cpp.s: cmake_force
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green "Compiling CXX source to assembly CMakeFiles/PDF_Tool.dir/src/Widget/PDFWidget/PDFWidget.cpp.s"
	C:\Development\Qt\Tools\mingw810_64\bin\g++.exe $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -S C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\src\Widget\PDFWidget\PDFWidget.cpp -o CMakeFiles\PDF_Tool.dir\src\Widget\PDFWidget\PDFWidget.cpp.s

CMakeFiles/PDF_Tool.dir/libraries/PDFtoImage/PDFtoImage.cpp.obj: CMakeFiles/PDF_Tool.dir/flags.make
CMakeFiles/PDF_Tool.dir/libraries/PDFtoImage/PDFtoImage.cpp.obj: CMakeFiles/PDF_Tool.dir/includes_CXX.rsp
CMakeFiles/PDF_Tool.dir/libraries/PDFtoImage/PDFtoImage.cpp.obj: ../libraries/PDFtoImage/PDFtoImage.cpp
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green --progress-dir=C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\cmake-build-debug\CMakeFiles --progress-num=$(CMAKE_PROGRESS_6) "Building CXX object CMakeFiles/PDF_Tool.dir/libraries/PDFtoImage/PDFtoImage.cpp.obj"
	C:\Development\Qt\Tools\mingw810_64\bin\g++.exe $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -o CMakeFiles\PDF_Tool.dir\libraries\PDFtoImage\PDFtoImage.cpp.obj -c C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\libraries\PDFtoImage\PDFtoImage.cpp

CMakeFiles/PDF_Tool.dir/libraries/PDFtoImage/PDFtoImage.cpp.i: cmake_force
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green "Preprocessing CXX source to CMakeFiles/PDF_Tool.dir/libraries/PDFtoImage/PDFtoImage.cpp.i"
	C:\Development\Qt\Tools\mingw810_64\bin\g++.exe $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -E C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\libraries\PDFtoImage\PDFtoImage.cpp > CMakeFiles\PDF_Tool.dir\libraries\PDFtoImage\PDFtoImage.cpp.i

CMakeFiles/PDF_Tool.dir/libraries/PDFtoImage/PDFtoImage.cpp.s: cmake_force
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green "Compiling CXX source to assembly CMakeFiles/PDF_Tool.dir/libraries/PDFtoImage/PDFtoImage.cpp.s"
	C:\Development\Qt\Tools\mingw810_64\bin\g++.exe $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -S C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\libraries\PDFtoImage\PDFtoImage.cpp -o CMakeFiles\PDF_Tool.dir\libraries\PDFtoImage\PDFtoImage.cpp.s

CMakeFiles/PDF_Tool.dir/libraries/Setting/Setting.cpp.obj: CMakeFiles/PDF_Tool.dir/flags.make
CMakeFiles/PDF_Tool.dir/libraries/Setting/Setting.cpp.obj: CMakeFiles/PDF_Tool.dir/includes_CXX.rsp
CMakeFiles/PDF_Tool.dir/libraries/Setting/Setting.cpp.obj: ../libraries/Setting/Setting.cpp
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green --progress-dir=C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\cmake-build-debug\CMakeFiles --progress-num=$(CMAKE_PROGRESS_7) "Building CXX object CMakeFiles/PDF_Tool.dir/libraries/Setting/Setting.cpp.obj"
	C:\Development\Qt\Tools\mingw810_64\bin\g++.exe $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -o CMakeFiles\PDF_Tool.dir\libraries\Setting\Setting.cpp.obj -c C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\libraries\Setting\Setting.cpp

CMakeFiles/PDF_Tool.dir/libraries/Setting/Setting.cpp.i: cmake_force
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green "Preprocessing CXX source to CMakeFiles/PDF_Tool.dir/libraries/Setting/Setting.cpp.i"
	C:\Development\Qt\Tools\mingw810_64\bin\g++.exe $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -E C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\libraries\Setting\Setting.cpp > CMakeFiles\PDF_Tool.dir\libraries\Setting\Setting.cpp.i

CMakeFiles/PDF_Tool.dir/libraries/Setting/Setting.cpp.s: cmake_force
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green "Compiling CXX source to assembly CMakeFiles/PDF_Tool.dir/libraries/Setting/Setting.cpp.s"
	C:\Development\Qt\Tools\mingw810_64\bin\g++.exe $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -S C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\libraries\Setting\Setting.cpp -o CMakeFiles\PDF_Tool.dir\libraries\Setting\Setting.cpp.s

CMakeFiles/PDF_Tool.dir/resource/win32_rc.rc.obj: CMakeFiles/PDF_Tool.dir/flags.make
CMakeFiles/PDF_Tool.dir/resource/win32_rc.rc.obj: ../resource/win32_rc.rc
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green --progress-dir=C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\cmake-build-debug\CMakeFiles --progress-num=$(CMAKE_PROGRESS_8) "Building RC object CMakeFiles/PDF_Tool.dir/resource/win32_rc.rc.obj"
	C:\Development\Qt\Tools\mingw810_64\bin\windres.exe -O coff $(RC_DEFINES) $(RC_INCLUDES) $(RC_FLAGS) C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\resource\win32_rc.rc CMakeFiles\PDF_Tool.dir\resource\win32_rc.rc.obj

CMakeFiles/PDF_Tool.dir/PDF_Tool_autogen/6WJNPILU4A/qrc_resource.cpp.obj: CMakeFiles/PDF_Tool.dir/flags.make
CMakeFiles/PDF_Tool.dir/PDF_Tool_autogen/6WJNPILU4A/qrc_resource.cpp.obj: CMakeFiles/PDF_Tool.dir/includes_CXX.rsp
CMakeFiles/PDF_Tool.dir/PDF_Tool_autogen/6WJNPILU4A/qrc_resource.cpp.obj: PDF_Tool_autogen/6WJNPILU4A/qrc_resource.cpp
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green --progress-dir=C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\cmake-build-debug\CMakeFiles --progress-num=$(CMAKE_PROGRESS_9) "Building CXX object CMakeFiles/PDF_Tool.dir/PDF_Tool_autogen/6WJNPILU4A/qrc_resource.cpp.obj"
	C:\Development\Qt\Tools\mingw810_64\bin\g++.exe $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -o CMakeFiles\PDF_Tool.dir\PDF_Tool_autogen\6WJNPILU4A\qrc_resource.cpp.obj -c C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\cmake-build-debug\PDF_Tool_autogen\6WJNPILU4A\qrc_resource.cpp

CMakeFiles/PDF_Tool.dir/PDF_Tool_autogen/6WJNPILU4A/qrc_resource.cpp.i: cmake_force
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green "Preprocessing CXX source to CMakeFiles/PDF_Tool.dir/PDF_Tool_autogen/6WJNPILU4A/qrc_resource.cpp.i"
	C:\Development\Qt\Tools\mingw810_64\bin\g++.exe $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -E C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\cmake-build-debug\PDF_Tool_autogen\6WJNPILU4A\qrc_resource.cpp > CMakeFiles\PDF_Tool.dir\PDF_Tool_autogen\6WJNPILU4A\qrc_resource.cpp.i

CMakeFiles/PDF_Tool.dir/PDF_Tool_autogen/6WJNPILU4A/qrc_resource.cpp.s: cmake_force
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green "Compiling CXX source to assembly CMakeFiles/PDF_Tool.dir/PDF_Tool_autogen/6WJNPILU4A/qrc_resource.cpp.s"
	C:\Development\Qt\Tools\mingw810_64\bin\g++.exe $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -S C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\cmake-build-debug\PDF_Tool_autogen\6WJNPILU4A\qrc_resource.cpp -o CMakeFiles\PDF_Tool.dir\PDF_Tool_autogen\6WJNPILU4A\qrc_resource.cpp.s

# Object files for target PDF_Tool
PDF_Tool_OBJECTS = \
"CMakeFiles/PDF_Tool.dir/PDF_Tool_autogen/mocs_compilation.cpp.obj" \
"CMakeFiles/PDF_Tool.dir/src/main.cpp.obj" \
"CMakeFiles/PDF_Tool.dir/src/Widget/MainWindow/MainWindow.cpp.obj" \
"CMakeFiles/PDF_Tool.dir/src/Widget/PDFWidget/PDFWidget.cpp.obj" \
"CMakeFiles/PDF_Tool.dir/libraries/PDFtoImage/PDFtoImage.cpp.obj" \
"CMakeFiles/PDF_Tool.dir/libraries/Setting/Setting.cpp.obj" \
"CMakeFiles/PDF_Tool.dir/resource/win32_rc.rc.obj" \
"CMakeFiles/PDF_Tool.dir/PDF_Tool_autogen/6WJNPILU4A/qrc_resource.cpp.obj"

# External object files for target PDF_Tool
PDF_Tool_EXTERNAL_OBJECTS =

PDF_Tool.exe: CMakeFiles/PDF_Tool.dir/PDF_Tool_autogen/mocs_compilation.cpp.obj
PDF_Tool.exe: CMakeFiles/PDF_Tool.dir/src/main.cpp.obj
PDF_Tool.exe: CMakeFiles/PDF_Tool.dir/src/Widget/MainWindow/MainWindow.cpp.obj
PDF_Tool.exe: CMakeFiles/PDF_Tool.dir/src/Widget/PDFWidget/PDFWidget.cpp.obj
PDF_Tool.exe: CMakeFiles/PDF_Tool.dir/libraries/PDFtoImage/PDFtoImage.cpp.obj
PDF_Tool.exe: CMakeFiles/PDF_Tool.dir/libraries/Setting/Setting.cpp.obj
PDF_Tool.exe: CMakeFiles/PDF_Tool.dir/resource/win32_rc.rc.obj
PDF_Tool.exe: CMakeFiles/PDF_Tool.dir/PDF_Tool_autogen/6WJNPILU4A/qrc_resource.cpp.obj
PDF_Tool.exe: CMakeFiles/PDF_Tool.dir/build.make
PDF_Tool.exe: C:/Development/Qt/5.15.2/mingw81_64/lib/libQt5Widgets.a
PDF_Tool.exe: C:/Development/Qt/5.15.2/mingw81_64/lib/libQt5Gui.a
PDF_Tool.exe: C:/Development/Qt/5.15.2/mingw81_64/lib/libQt5Core.a
PDF_Tool.exe: CMakeFiles/PDF_Tool.dir/linklibs.rsp
PDF_Tool.exe: CMakeFiles/PDF_Tool.dir/objects1.rsp
PDF_Tool.exe: CMakeFiles/PDF_Tool.dir/link.txt
	@$(CMAKE_COMMAND) -E cmake_echo_color --switch=$(COLOR) --green --bold --progress-dir=C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\cmake-build-debug\CMakeFiles --progress-num=$(CMAKE_PROGRESS_10) "Linking CXX executable PDF_Tool.exe"
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libpoppler-105.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libpoppler-cpp-0.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libpoppler-qt5-1.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/liblcms2-2.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libfreetype-6.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libcurl-4.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libbz2-1.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libbrotlidec.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libharfbuzz-0.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libpng16-16.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/zlib1.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libbrotlicommon.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libglib-2.0-0.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libjpeg-8.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libnspr4.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/nss3.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libopenjp2-7.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/smime3.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libtiff-5.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libgraphite2.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libcrypto-1_1-x64.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libidn2-0.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libnghttp2-14.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libpsl-5.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libssh2-1.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libssl-1_1-x64.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libzstd.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/nssutil3.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libplc4.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libplds4.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libdeflate.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libjbig-0.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/liblzma-5.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libwebp-7.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libintl-8.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libpcre-1.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libiconv-2.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/libunistring-2.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	"C:\Program Files\JetBrains\CLion 2021.2\bin\cmake\win\bin\cmake.exe" -E copy C:/Development/msys2/mingw64/bin/Qt5Xml.dll C:/Users/a2882/Documents/PDF_Tool_Project/PDF_Tool/cmake-build-debug
	$(CMAKE_COMMAND) -E cmake_link_script CMakeFiles\PDF_Tool.dir\link.txt --verbose=$(VERBOSE)

# Rule to build all files generated by this target.
CMakeFiles/PDF_Tool.dir/build: PDF_Tool.exe
.PHONY : CMakeFiles/PDF_Tool.dir/build

CMakeFiles/PDF_Tool.dir/clean:
	$(CMAKE_COMMAND) -P CMakeFiles\PDF_Tool.dir\cmake_clean.cmake
.PHONY : CMakeFiles/PDF_Tool.dir/clean

CMakeFiles/PDF_Tool.dir/depend: PDF_Tool_autogen/6WJNPILU4A/qrc_resource.cpp
	$(CMAKE_COMMAND) -E cmake_depends "MinGW Makefiles" C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\cmake-build-debug C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\cmake-build-debug C:\Users\a2882\Documents\PDF_Tool_Project\PDF_Tool\cmake-build-debug\CMakeFiles\PDF_Tool.dir\DependInfo.cmake --color=$(COLOR)
.PHONY : CMakeFiles/PDF_Tool.dir/depend

