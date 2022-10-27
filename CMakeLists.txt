# project basic setup
project(PDF_Tool LANGUAGES CXX)
cmake_minimum_required(VERSION 3.2)

# find Qt package
find_package(QT NAMES Qt6 COMPONENTS Widgets REQUIRED)
find_package(Qt${QT_VERSION_MAJOR} COMPONENTS Widgets REQUIRED)

# using conan package manager and run conan setup
include(${CMAKE_BINARY_DIR}/conanbuildinfo.cmake)
conan_basic_setup()

# make executable using project source code
add_executable(PDF_Tool src/main.cpp)

# link lib to executable
target_link_libraries(PDF_Tool PRIVATE ${CONAN_LIBS}  Qt${QT_VERSION_MAJOR}::Widgets)
