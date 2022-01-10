cmake_minimum_required(VERSION 3.2)

project(PDF_Tool LANGUAGES CXX)

set(TARGET_NAME ${PROJECT_NAME}) 


set(Win32_dll "libpoppler-105.dll" "libpoppler-cpp-0.dll" "libpoppler-qt5-1.dll" "liblcms2-2.dll" "libfreetype-6.dll"
        "libcurl-4.dll" "libbz2-1.dll" "libbrotlidec.dll" "libharfbuzz-0.dll" "libpng16-16.dll"
        "zlib1.dll" "libbrotlicommon.dll" "libglib-2.0-0.dll" "libjpeg-8.dll" "libnspr4.dll"
        "nss3.dll" "libopenjp2-7.dll" "smime3.dll" "libtiff-5.dll" "libgraphite2.dll"
        "libcrypto-1_1-x64.dll" "libidn2-0.dll" "libnghttp2-14.dll" "libpsl-5.dll" "libssh2-1.dll"
        "libssl-1_1-x64.dll" "libzstd.dll" "nssutil3.dll" "libplc4.dll" "libplds4.dll"
        "libdeflate.dll" "libjbig-0.dll" "liblzma-5.dll" "libwebp-7.dll" "libintl-8.dll"
        "libpcre-1.dll" "libiconv-2.dll" "libunistring-2.dll" "Qt5Xml.dll")

include_directories(${other_library_path}/include)
link_directories(${other_library_path}/lib)



set(CMAKE_INCLUDE_CURRENT_DIR ON)
set(CMAKE_AUTOUIC ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(PROJECT_SOURCES
        src/main.cpp
        src/Widget/MainWindow/MainWindow.cpp src/Widget/MainWindow/MainWindow.h src/Widget/MainWindow/MainWindow.ui
        src/Widget/PDFWidget/PDFWidget.cpp src/Widget/PDFWidget/PDFWidget.h src/Widget/PDFWidget/PDFWidget.ui
        src/Widget/PDFView_Widget/PDFView_Widget.cpp  src/Widget/PDFView_Widget/PDFView_Widget.h src/Widget/PDFView_Widget/PDFView_Widget.ui
        libraries/PDFtoImage/PDFtoImage.cpp libraries/PDFtoImage/PDFtoImage.h
        libraries/Setting/Setting.cpp libraries/Setting/Setting.h
        resource/resource.qrc resource/win32_rc.rc 
        libraries/PDFUtils/PDFUtils.cpp libraries/PDFUtils/PDFUtils.h)

find_package(QT NAMES Qt6 Qt5 COMPONENTS Widgets REQUIRED)
find_package(Qt${QT_VERSION_MAJOR} COMPONENTS Widgets REQUIRED)

if (WIN32)
    if (CMAKE_BUILD_TYPE STREQUAL Debug)
        add_executable(PDF_Tool ${PROJECT_SOURCES})
    else()
        add_executable(PDF_Tool WIN32 ${PROJECT_SOURCES})
    endif()
else()
    add_executable(PDF_Tool ${PROJECT_SOURCES})
endif()

target_link_libraries(PDF_Tool PRIVATE Qt${QT_VERSION_MAJOR}::Widgets poppler-qt5 poppler-cpp)

#if (WIN32)
#    foreach(dll ${Win32_dll})
#        set(LIBGCC_DLL "${MINGW_BIN_PATH}/${dll}")
#        add_custom_command(TARGET ${TARGET_NAME} PRE_BUILD
#        COMMAND ${CMAKE_COMMAND} -E copy
#        ${LIBGCC_DLL} $<TARGET_FILE_DIR:${TARGET_NAME}>)
#    endforeach()
#endif()




