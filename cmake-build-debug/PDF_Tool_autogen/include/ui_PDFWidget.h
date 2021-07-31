/********************************************************************************
** Form generated from reading UI file 'PDFWidget.ui'
**
** Created by: Qt User Interface Compiler version 5.15.2
**
** WARNING! All changes made in this file will be lost when recompiling UI file!
********************************************************************************/

#ifndef UI_PDFWIDGET_H
#define UI_PDFWIDGET_H

#include <QtCore/QVariant>
#include <QtWidgets/QApplication>
#include <QtWidgets/QComboBox>
#include <QtWidgets/QGridLayout>
#include <QtWidgets/QGroupBox>
#include <QtWidgets/QHBoxLayout>
#include <QtWidgets/QLabel>
#include <QtWidgets/QListWidget>
#include <QtWidgets/QPushButton>
#include <QtWidgets/QSpacerItem>
#include <QtWidgets/QVBoxLayout>
#include <QtWidgets/QWidget>

QT_BEGIN_NAMESPACE

class Ui_PDFWidget
{
public:
    QHBoxLayout *horizontalLayout_2;
    QVBoxLayout *verticalLayout_4;
    QListWidget *listWidget;
    QHBoxLayout *horizontalLayout;
    QPushButton *btn_addFile;
    QPushButton *btn_delFile;
    QVBoxLayout *verticalLayout;
    QGroupBox *groupBox;
    QVBoxLayout *verticalLayout_2;
    QGridLayout *gridLayout;
    QComboBox *comboBox_format;
    QLabel *label_2;
    QLabel *label;
    QComboBox *comboBox_dpi;
    QSpacerItem *verticalSpacer;
    QPushButton *btn_conversion;
    QSpacerItem *verticalSpacer_2;

    void setupUi(QWidget *PDFWidget)
    {
        if (PDFWidget->objectName().isEmpty())
            PDFWidget->setObjectName(QString::fromUtf8("PDFWidget"));
        PDFWidget->resize(717, 492);
        horizontalLayout_2 = new QHBoxLayout(PDFWidget);
        horizontalLayout_2->setObjectName(QString::fromUtf8("horizontalLayout_2"));
        verticalLayout_4 = new QVBoxLayout();
        verticalLayout_4->setObjectName(QString::fromUtf8("verticalLayout_4"));
        listWidget = new QListWidget(PDFWidget);
        listWidget->setObjectName(QString::fromUtf8("listWidget"));

        verticalLayout_4->addWidget(listWidget);

        horizontalLayout = new QHBoxLayout();
        horizontalLayout->setObjectName(QString::fromUtf8("horizontalLayout"));
        btn_addFile = new QPushButton(PDFWidget);
        btn_addFile->setObjectName(QString::fromUtf8("btn_addFile"));

        horizontalLayout->addWidget(btn_addFile);

        btn_delFile = new QPushButton(PDFWidget);
        btn_delFile->setObjectName(QString::fromUtf8("btn_delFile"));

        horizontalLayout->addWidget(btn_delFile);


        verticalLayout_4->addLayout(horizontalLayout);


        horizontalLayout_2->addLayout(verticalLayout_4);

        verticalLayout = new QVBoxLayout();
        verticalLayout->setObjectName(QString::fromUtf8("verticalLayout"));
        groupBox = new QGroupBox(PDFWidget);
        groupBox->setObjectName(QString::fromUtf8("groupBox"));
        verticalLayout_2 = new QVBoxLayout(groupBox);
        verticalLayout_2->setObjectName(QString::fromUtf8("verticalLayout_2"));
        gridLayout = new QGridLayout();
        gridLayout->setObjectName(QString::fromUtf8("gridLayout"));
        comboBox_format = new QComboBox(groupBox);
        comboBox_format->setObjectName(QString::fromUtf8("comboBox_format"));

        gridLayout->addWidget(comboBox_format, 2, 1, 1, 1);

        label_2 = new QLabel(groupBox);
        label_2->setObjectName(QString::fromUtf8("label_2"));

        gridLayout->addWidget(label_2, 2, 0, 1, 1);

        label = new QLabel(groupBox);
        label->setObjectName(QString::fromUtf8("label"));

        gridLayout->addWidget(label, 0, 0, 1, 1);

        comboBox_dpi = new QComboBox(groupBox);
        comboBox_dpi->setObjectName(QString::fromUtf8("comboBox_dpi"));

        gridLayout->addWidget(comboBox_dpi, 0, 1, 1, 1);


        verticalLayout_2->addLayout(gridLayout);

        verticalSpacer = new QSpacerItem(20, 40, QSizePolicy::Minimum, QSizePolicy::Expanding);

        verticalLayout_2->addItem(verticalSpacer);

        btn_conversion = new QPushButton(groupBox);
        btn_conversion->setObjectName(QString::fromUtf8("btn_conversion"));

        verticalLayout_2->addWidget(btn_conversion);

        verticalSpacer_2 = new QSpacerItem(20, 40, QSizePolicy::Minimum, QSizePolicy::Expanding);

        verticalLayout_2->addItem(verticalSpacer_2);


        verticalLayout->addWidget(groupBox);


        horizontalLayout_2->addLayout(verticalLayout);


        retranslateUi(PDFWidget);

        QMetaObject::connectSlotsByName(PDFWidget);
    } // setupUi

    void retranslateUi(QWidget *PDFWidget)
    {
        PDFWidget->setWindowTitle(QCoreApplication::translate("PDFWidget", "PDFWidget", nullptr));
        btn_addFile->setText(QCoreApplication::translate("PDFWidget", "\346\226\260\345\242\236\346\252\224\346\241\210", nullptr));
        btn_delFile->setText(QCoreApplication::translate("PDFWidget", "\345\210\252\351\231\244\346\252\224\346\241\210", nullptr));
        groupBox->setTitle(QCoreApplication::translate("PDFWidget", "\350\275\211\346\252\224\350\250\255\345\256\232", nullptr));
        label_2->setText(QCoreApplication::translate("PDFWidget", "\345\234\226\347\211\207\346\240\274\345\274\217:", nullptr));
        label->setText(QCoreApplication::translate("PDFWidget", "\345\234\226\347\211\207DPI:", nullptr));
        btn_conversion->setText(QCoreApplication::translate("PDFWidget", "\350\275\211\346\252\224", nullptr));
    } // retranslateUi

};

namespace Ui {
    class PDFWidget: public Ui_PDFWidget {};
} // namespace Ui

QT_END_NAMESPACE

#endif // UI_PDFWIDGET_H
